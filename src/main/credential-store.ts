// Persists saved DB connection profiles to disk in userData/connections.json.
// Only the password is encrypted (via Electron's safeStorage, OS-keychain-backed) --
// host/port/db/user are already visible in plaintext elsewhere (the connect form,
// the connection label), so encrypting them too would only cost a decrypt call
// per row for no real protection gained.
import { randomUUID } from 'crypto';
import { app, ipcMain, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// Mirrors pine-lang's pine.access-policy rule shape 1:1 -- these travel
// verbatim (minus `enabled`, stripped in effectiveAccessPolicyRules -- see
// beamlynx-ui's client.ts) as the `access-policy` param on pine-lang's
// /api/v1/build and /api/v1/eval. pine-lang carries no policy content of
// its own; this is the only place it lives. Deliberately a closed set of
// `type`s for now, but the shape is exactly what the Access Policy settings
// section reads and writes -- adding a rule type later is a new union
// member, a new row in that section, and a new pine.access-policy `case`
// branch, not a reshape.
export type AccessPolicyRule =
  | { type: 'column-type'; allow: string[] } // real Postgres type is in `allow`
  | { type: 'foreign-key' } // column is a source column of a detected FK/heuristic relation
  | { type: 'column-name'; suffix: string }; // column name ends with `suffix` -- weaker, opt-in

// One module of a named policy: a rule plus whether it's currently on. The
// array actually sent to pine-lang is `policy.rules.filter(m => m.enabled)`
// with `enabled` stripped (see beamlynx-ui's client.ts
// effectiveAccessPolicyRules) -- pine-lang never sees this flag, it only
// sees rules that are already active.
export type AccessPolicyModule = AccessPolicyRule & { enabled: boolean };

// A named, user-creatable set of rule modules -- there can be several (see
// AccessPolicySection.tsx), and each connection independently selects which
// one applies to it (SavedConnectionMeta.policyId below), or none at all.
export type AccessPolicy = {
  id: string;
  name: string;
  rules: AccessPolicyModule[];
};

// The starting rule set for both the one policy seeded on first run
// ("Default") and any policy created afterward (createAccessPolicy) -- the
// same values pine-lang's access-policy POC originally hardcoded, now
// living here as data instead. Not a global default in any other sense:
// once seeded/created, a policy's rules are independently editable and
// this constant is never consulted again for it.
export const DEFAULT_ACCESS_POLICY: AccessPolicyModule[] = [
  {
    type: 'column-type',
    enabled: true,
    allow: [
      'uuid',
      'boolean',
      'bool',
      'smallint',
      'integer',
      'bigint',
      'int2',
      'int4',
      'int8',
      'numeric',
      'decimal',
      'real',
      'double precision',
      'float4',
      'float8',
      'money',
      'date',
      'time',
      'time without time zone',
      'time with time zone',
      'timestamp',
      'timestamp without time zone',
      'timestamp with time zone',
      'timestamptz',
      'USER-DEFINED',
    ],
  },
  { type: 'foreign-key', enabled: true },
  { type: 'column-name', suffix: '_id', enabled: true },
];

function makeDefaultPolicy(rules: AccessPolicyModule[] = DEFAULT_ACCESS_POLICY): AccessPolicy {
  return { id: randomUUID(), name: 'Default', rules };
}

export type SavedConnectionMeta = {
  id: string;
  label: string;
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  createdAt: string;
  lastUsedAt: string;
  // Off by default -- this is the access-control lever for the MCP server
  // (see beamlynx-plans/pending/2026-08-15-mcp-server-and-url-scheme.md).
  // The control-plane server checks this before letting an MCP client touch a
  // connection at all; a connection a user has never explicitly opted in
  // stays invisible to MCP clients regardless of what pine-lang itself allows.
  // Can only be true while `policyId` is a deliberate decision -- either null
  // ("None", picked explicitly in the policy dropdown -- unrestricted access,
  // e.g. a local/sandbox DB the owner doesn't need redacted) or an id that
  // resolves to a policy with an active rule -- see setMcpEnabled and
  // isConnectionPolicyActive. There's no "reachable but undecided" state.
  mcpEnabled: boolean;
  // Which access policy applies to THIS connection's queries -- required
  // (and, if non-null, required to have an active rule) whenever mcpEnabled
  // is true; setConnectionPolicy refuses blanking it to a policy with no
  // active rule while MCP is on for this connection, and deleteAccessPolicy
  // turns MCP off for any connection whose policy it removes, rather than
  // leave mcpEnabled: true pointing at a stale id. null itself is a valid,
  // deliberate value even with MCP on -- see isConnectionPolicyActive --
  // meaning "None": no redaction, full access. It's also the value a
  // freshly-created connection starts with before its owner has picked
  // anything, so null does double duty as both "undecided" (MCP off) and
  // "explicitly unrestricted" (MCP on) depending on mcpEnabled -- there is
  // no separate state for the former because a connection can't reach
  // mcpEnabled: true without someone having looked at the policy picker.
  policyId: string | null;
  // Whether the connection owner has switched OFF the assigned policy for
  // their own queries, from any of their own (non-MCP) tabs -- independent
  // of MCP, which always applies the policy unconditionally and never reads
  // this. Defaults to false (protected by default, same posture as
  // mcpEnabled/policyId): the policy applies to the owner's own queries too
  // unless they explicitly bypass it -- e.g. to see real data while
  // debugging -- which never weakens what an MCP agent sees on the same
  // connection. Moot when policyId is null (nothing to bypass either way).
  bypassPolicyForOwnQueries: boolean;
};

type StoredConnectionRecord = SavedConnectionMeta & { dbPasswordEncrypted: string };

type StoreFile = { version: 1; connections: StoredConnectionRecord[]; accessPolicies: AccessPolicy[] };

export type CredentialsStatus = {
  persistenceAvailable: boolean;
  linuxBackend?: string;
};

export type SaveConnectionInput = {
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  // Optional; falls back to makeLabel's derived `user@host:port/db` when
  // blank or omitted. Only used for a brand-new record -- an upsert onto an
  // existing one (see saveConnection below) keeps that record's own label,
  // since renaming is a separate, explicit action (see renameConnection).
  label?: string;
};

export type SaveConnectionResult = { persisted: true; profile: SavedConnectionMeta } | { persisted: false };

export type GetConnectionResult =
  | { ok: true; profile: SavedConnectionMeta; dbPassword: string }
  | { ok: false; error: 'not-found' }
  // Host/port/db/user are stored in plaintext regardless -- only the
  // password fails to decrypt -- so the caller still gets the profile to
  // work with (e.g. to prompt "re-enter just the password").
  | { ok: false; error: 'decryption-failed'; profile: SavedConnectionMeta };

// `null` (the old return type) already meant "connection id not found" --
// once refusing to enable MCP without an active policy became a second
// failure mode, that ambiguity had to go: a caller needs to tell "this
// connection doesn't exist" apart from "it exists, but I won't do that."
export type SetMcpEnabledResult =
  | { ok: true; profile: SavedConnectionMeta }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'no-active-policy' };

// Same shape/reasoning as SetMcpEnabledResult -- clearing or blanking a
// connection's policy while MCP is on for it is a second way to reach the
// disallowed "MCP on, no active policy" state, so it needs the same
// explicit refusal rather than silently violating the invariant.
export type SetConnectionPolicyResult =
  | { ok: true; profile: SavedConnectionMeta }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'mcp-requires-policy' };

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'connections.json');
}

function emptyStore(): StoreFile {
  return { version: 1, connections: [], accessPolicies: [makeDefaultPolicy()] };
}

// A corrupt or missing file must never block app boot -- default to empty
// rather than throwing. Also migrates (once, persisted immediately -- not
// just a type-level fallback re-applied on every read) a store written
// before named policies existed:
//  - a store with the earlier single-global-policy shape (`accessPolicy:
//    AccessPolicyModule[]`) has its rules wrapped into one named "Default"
//    policy instead of discarding whatever was already configured through
//    that (now-replaced) global toggle UI;
//  - each connection's old boolean `policyEnabled` becomes `policyId`:
//    true -> the newly-created Default policy's id (unchanged effective
//    behavior), false/absent -> null.
// Persisting the migration matters here specifically: a read-only fallback
// that never actually lands on disk is exactly the bug that made an
// earlier version of this feature so hard to trust -- inspecting
// connections.json directly showed a different value than what the app was
// actually using. This store has to stay honest with itself.
function readStore(): StoreFile {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.connections)) {
      return emptyStore();
    }
    if (!Array.isArray(parsed.accessPolicies)) {
      const migratedRules = Array.isArray(parsed.accessPolicy) ? parsed.accessPolicy : DEFAULT_ACCESS_POLICY;
      const defaultPolicy = makeDefaultPolicy(migratedRules);
      parsed.accessPolicies = [defaultPolicy];
      delete parsed.accessPolicy;
      parsed.connections = parsed.connections.map((c: Record<string, unknown>) => {
        if (c.policyId !== undefined) return c;
        const { policyEnabled, ...rest } = c;
        return { ...rest, policyId: policyEnabled ? defaultPolicy.id : null };
      });
      writeStore(parsed as StoreFile);
    }
    return parsed as StoreFile;
  } catch {
    return emptyStore();
  }
}

// Write-to-temp-then-rename is atomic on POSIX and NTFS, so a hard kill
// mid-write can't leave a truncated/corrupt connections.json behind.
function writeStore(store: StoreFile): void {
  const storePath = getStorePath();
  const tmpPath = `${storePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tmpPath, storePath);
}

function toMeta(record: StoredConnectionRecord): SavedConnectionMeta {
  const { dbPasswordEncrypted: _dbPasswordEncrypted, ...meta } = record;
  // Records written before these fields existed have neither key -- default
  // each to its protective value (opt-in for mcpEnabled, no policy assigned
  // for policyId, not bypassed for bypassPolicyForOwnQueries) rather than
  // leaving it undefined.
  const mcpEnabled = meta.mcpEnabled ?? false;
  const policyId = meta.policyId ?? null;
  const bypassPolicyForOwnQueries = meta.bypassPolicyForOwnQueries ?? false;
  return { ...meta, mcpEnabled, policyId, bypassPolicyForOwnQueries };
}

function makeLabel(input: Pick<SaveConnectionInput, 'dbUser' | 'dbHost' | 'dbPort' | 'dbName'>): string {
  return `${input.dbUser}@${input.dbHost}:${input.dbPort}/${input.dbName}`;
}

// On Linux, `basic_text` means safeStorage falls back to a hardcoded,
// publicly-known encryption key -- not meaningfully different from storing
// the password unencrypted. Treated the same as encryption being fully
// unavailable: don't persist rather than pretend to protect it.
export function getCredentialsStatus(): CredentialsStatus {
  if (!safeStorage.isEncryptionAvailable()) {
    console.log('[credentials] isEncryptionAvailable() = false -> persistenceAvailable: false');
    return { persistenceAvailable: false };
  }
  if (process.platform === 'linux') {
    const linuxBackend = safeStorage.getSelectedStorageBackend();
    const status = { persistenceAvailable: linuxBackend !== 'basic_text', linuxBackend };
    console.log('[credentials] getCredentialsStatus (linux):', status);
    return status;
  }
  console.log('[credentials] getCredentialsStatus:', { persistenceAvailable: true });
  return { persistenceAvailable: true };
}

export function listConnections(): SavedConnectionMeta[] {
  const list = readStore().connections.map(toMeta);
  console.log(`[credentials] listConnections -> ${list.length} saved (store: ${getStorePath()})`);
  return list;
}

// Upserts on (dbHost, dbPort, dbName, dbUser) -- password is deliberately
// excluded from the identity key, so reconnecting to the same target with a
// changed password overwrites the existing record instead of duplicating it.
//
// Uses safeStorage's synchronous encryptString/decryptString rather than the
// async variants (encryptStringAsync/decryptStringAsync, which also report
// shouldReEncrypt for key rotation) -- the version of Electron this app is
// built against (31.x) doesn't have the async API yet. Fine here: a single
// short password string encrypts/decrypts in well under a millisecond, so
// the main-process blocking cost is negligible.
export function saveConnection(input: SaveConnectionInput): SaveConnectionResult {
  console.log(
    `[credentials] saveConnection called for ${input.dbUser}@${input.dbHost}:${input.dbPort}/${input.dbName}`,
  );
  if (!getCredentialsStatus().persistenceAvailable) {
    console.log('[credentials] saveConnection: persistence unavailable, not writing to disk');
    return { persisted: false };
  }

  const dbPasswordEncrypted = safeStorage.encryptString(input.dbPassword).toString('base64');
  const now = new Date().toISOString();

  const store = readStore();
  const existingIndex = store.connections.findIndex(
    c =>
      c.dbHost === input.dbHost &&
      c.dbPort === input.dbPort &&
      c.dbName === input.dbName &&
      c.dbUser === input.dbUser,
  );

  let record: StoredConnectionRecord;
  if (existingIndex >= 0) {
    record = { ...store.connections[existingIndex], dbPasswordEncrypted, lastUsedAt: now };
    store.connections[existingIndex] = record;
  } else {
    record = {
      id: randomUUID(),
      label: input.label?.trim() || makeLabel(input),
      dbHost: input.dbHost,
      dbPort: input.dbPort,
      dbName: input.dbName,
      dbUser: input.dbUser,
      createdAt: now,
      lastUsedAt: now,
      dbPasswordEncrypted,
      mcpEnabled: false,
      // Protected by default from creation, independent of mcpEnabled --
      // whichever policy exists first, so by the time MCP is ever turned on
      // for this connection, a policy is already applying. Falls back to
      // null only if every policy has been deleted.
      policyId: store.accessPolicies[0]?.id ?? null,
      bypassPolicyForOwnQueries: false,
    };
    store.connections.push(record);
  }

  writeStore(store);
  console.log(
    `[credentials] saveConnection: ${existingIndex >= 0 ? 'updated' : 'created'} profile ${record.id} -> wrote ${getStorePath()}`,
  );
  return { persisted: true, profile: toMeta(record) };
}

export function getConnection(id: string): GetConnectionResult {
  const store = readStore();
  const record = store.connections.find(c => c.id === id);
  if (!record) {
    return { ok: false, error: 'not-found' };
  }

  try {
    const dbPassword = safeStorage.decryptString(Buffer.from(record.dbPasswordEncrypted, 'base64'));
    return { ok: true, profile: toMeta(record), dbPassword };
  } catch {
    return { ok: false, error: 'decryption-failed', profile: toMeta(record) };
  }
}

export function forgetConnection(id: string): void {
  const store = readStore();
  const connections = store.connections.filter(c => c.id !== id);
  if (connections.length !== store.connections.length) {
    writeStore({ ...store, connections });
  }
}

function policyIsActive(policy: AccessPolicy | undefined): boolean {
  return !!policy && policy.rules.some(m => m.enabled);
}

// True iff THIS connection's policy decision is one MCP may run behind:
// either policyId is null (the deliberate "None" choice -- unrestricted
// access) or it resolves to a policy with an active rule. The real security
// boundary (see listMcpEnabledConnections/getMcpAccessStatus below), not
// just a precondition setMcpEnabled/setConnectionPolicy check -- MCP always
// reflects a decision someone made, never a stale/undecided id. Per
// connection, not global: each connection is checked against the specific
// policy it points at, not against "does any policy anywhere have a rule on."
function isConnectionPolicyActive(store: StoreFile, connection: { policyId: string | null }): boolean {
  if (connection.policyId === null) return true;
  return policyIsActive(store.accessPolicies.find(p => p.id === connection.policyId));
}

// Refuses (does not flip the flag) turning MCP on for a connection whose
// own assigned policy is a real, named policy with no active rule -- the
// UX-level guard against a toggle that would be silently inert. Does NOT
// refuse when policyId is null: that's the deliberate "None" choice, not an
// oversight -- see isConnectionPolicyActive. Turning MCP off is never
// refused. Never touches policyId itself -- setConnectionPolicy is the
// other half of the invariant this maintains (see its own comment).
export function setMcpEnabled(id: string, enabled: boolean): SetMcpEnabledResult {
  const store = readStore();
  const index = store.connections.findIndex(c => c.id === id);
  if (index < 0) return { ok: false, reason: 'not-found' };
  if (enabled && !isConnectionPolicyActive(store, store.connections[index])) {
    return { ok: false, reason: 'no-active-policy' };
  }
  store.connections[index] = { ...store.connections[index], mcpEnabled: enabled };
  writeStore(store);
  console.log(`[credentials] setMcpEnabled: id=${id} enabled=${enabled}`);
  return { ok: true, profile: toMeta(store.connections[index]) };
}

// The per-connection counterpart to the access policy: which one applies to
// this connection's queries. Freely settable to any existing policy id, or
// to null ("None" -- unrestricted access), even while mcpEnabled is true --
// EXCEPT refuses setting it to a real, named policy with no active rule
// while mcpEnabled is true for this connection: that would leave MCP
// pointing at a policy that decides nothing, the same disallowed state
// setMcpEnabled itself guards against from the other direction. Does not
// otherwise validate that `policyId` exists -- a caller passing a stale id
// when MCP is off gets the same effect as null (no rules resolve, see
// beamlynx-ui's effectiveAccessPolicyRules), not an error.
export function setConnectionPolicy(id: string, policyId: string | null): SetConnectionPolicyResult {
  const store = readStore();
  const index = store.connections.findIndex(c => c.id === id);
  if (index < 0) return { ok: false, reason: 'not-found' };
  const current = store.connections[index];
  if (current.mcpEnabled && !isConnectionPolicyActive(store, { policyId })) {
    return { ok: false, reason: 'mcp-requires-policy' };
  }
  store.connections[index] = { ...current, policyId };
  writeStore(store);
  console.log(`[credentials] setConnectionPolicy: id=${id} policyId=${policyId ?? '(none)'}`);
  return { ok: true, profile: toMeta(store.connections[index]) };
}

// Whether THIS connection's owner has switched the assigned policy off for
// their own queries -- see SavedConnectionMeta.bypassPolicyForOwnQueries.
// No precondition of its own, unlike setConnectionPolicy/setMcpEnabled: it
// never affects what MCP sees, only the human's own tabs, so there's
// nothing to guard against.
export function setBypassPolicyForOwnQueries(id: string, bypass: boolean): SavedConnectionMeta | null {
  const store = readStore();
  const index = store.connections.findIndex(c => c.id === id);
  if (index < 0) return null;
  store.connections[index] = { ...store.connections[index], bypassPolicyForOwnQueries: bypass };
  writeStore(store);
  console.log(`[credentials] setBypassPolicyForOwnQueries: id=${id} bypass=${bypass}`);
  return toMeta(store.connections[index]);
}

export function listAccessPolicies(): AccessPolicy[] {
  return readStore().accessPolicies;
}

export function createAccessPolicy(name: string): AccessPolicy {
  const store = readStore();
  const policy: AccessPolicy = {
    id: randomUUID(),
    name: name.trim() || 'Untitled policy',
    // A fresh copy of the same starting rules the seeded Default policy
    // gets -- independently editable from that point on, not a live
    // reference to any shared default.
    rules: DEFAULT_ACCESS_POLICY.map(m => ({ ...m })),
  };
  store.accessPolicies.push(policy);
  writeStore(store);
  console.log(`[credentials] createAccessPolicy: id=${policy.id} name=${policy.name}`);
  return policy;
}

// A blank/whitespace-only name is a no-op rather than an error -- same
// convention as renameConnection below.
export function renameAccessPolicy(id: string, name: string): AccessPolicy | null {
  const store = readStore();
  const index = store.accessPolicies.findIndex(p => p.id === id);
  if (index < 0) return null;
  const trimmed = name.trim();
  if (trimmed) {
    store.accessPolicies[index] = { ...store.accessPolicies[index], name: trimmed };
    writeStore(store);
  }
  console.log(`[credentials] renameAccessPolicy: id=${id} name=${trimmed || '(blank, unchanged)'}`);
  return store.accessPolicies[index];
}

// Any connection pointing at this policy falls back to policyId: null --
// never left referencing a policy that no longer exists. Also turns
// mcpEnabled off for any such connection that had it on: leaving
// mcpEnabled: true with policyId: null would violate the same invariant
// setMcpEnabled/setConnectionPolicy already enforce from the other two
// directions -- deleting a connection's only policy is a third way to
// reach that state, so it needs the same guard, just applied as a cascade
// (there's no toggle here to simply refuse) rather than a refusal.
export function deleteAccessPolicy(id: string): void {
  const store = readStore();
  const accessPolicies = store.accessPolicies.filter(p => p.id !== id);
  if (accessPolicies.length === store.accessPolicies.length) return;
  const connections = store.connections.map(c =>
    c.policyId === id ? { ...c, policyId: null, mcpEnabled: false } : c,
  );
  writeStore({ ...store, accessPolicies, connections });
  console.log(`[credentials] deleteAccessPolicy: id=${id}`);
}

// `type` identifies which module within the policy -- column-name is the
// only rule with a second discriminating field (suffix), and there's
// exactly one of each type per policy, so `type` alone is a stable enough
// key for this small, fixed module set.
//
// Deliberately does NOT check whether disabling the last active rule here
// would strand an mcpEnabled connection pointing at this policy -- coupling
// a rule toggle to every connection that happens to use its policy would be
// a confusing, easy-to-forget dependency in the other direction. That gap
// is real (a policy can go inactive out from under an already-enabled
// connection this way) but is caught at actual MCP call time instead -- see
// getMcpAccessStatus, used by control-plane-server.ts's assertWhitelisted.
export function setAccessPolicyModuleEnabled(
  policyId: string,
  type: AccessPolicyRule['type'],
  enabled: boolean,
): AccessPolicy | null {
  const store = readStore();
  const index = store.accessPolicies.findIndex(p => p.id === policyId);
  if (index < 0) return null;
  const rules = store.accessPolicies[index].rules.map(m => (m.type === type ? { ...m, enabled } : m));
  store.accessPolicies[index] = { ...store.accessPolicies[index], rules };
  writeStore(store);
  console.log(`[credentials] setAccessPolicyModuleEnabled: policyId=${policyId} type=${type} enabled=${enabled}`);
  return store.accessPolicies[index];
}

// A blank/whitespace-only label is a no-op rather than an error -- there's no
// good fallback to show for an empty name, so the existing label just stands.
export function renameConnection(id: string, label: string): SavedConnectionMeta | null {
  const store = readStore();
  const index = store.connections.findIndex(c => c.id === id);
  if (index < 0) return null;
  const trimmed = label.trim();
  if (trimmed) {
    store.connections[index] = { ...store.connections[index], label: trimmed };
    writeStore(store);
  }
  console.log(`[credentials] renameConnection: id=${id} label=${trimmed || '(blank, unchanged)'}`);
  return toMeta(store.connections[index]);
}

// Used by the MCP control-plane server (see src/main/mcp/control-plane-server.ts)
// to resolve which saved connections an MCP client is allowed to see at all -- a
// connection absent from this list must be treated as if it doesn't exist,
// not merely "not returned by list_connections".
// The real enforcement point: also backs GET /connections in
// control-plane-server.ts, so both inherit this for free. A connection is
// included only when it's mcpEnabled AND its policy decision still holds
// (isConnectionPolicyActive: null/"None", or a named policy currently
// carrying an active rule) -- this is what makes the invariant hold against
// a policy that went inactive after the connection was set up, not just
// against setMcpEnabled/setConnectionPolicy's toggle-time checks.
// Per-connection, not a single global gate: one connection's policy going
// inactive doesn't affect any other connection's own, independently-assigned
// policy.
export function listMcpEnabledConnections(): SavedConnectionMeta[] {
  const store = readStore();
  return store.connections.map(toMeta).filter(c => c.mcpEnabled && isConnectionPolicyActive(store, c));
}

export type McpAccessStatus = 'ok' | 'not-found' | 'not-enabled' | 'no-active-policy';

// Used by control-plane-server.ts's assertWhitelisted to refuse an MCP
// tool call with a precise, distinct reason, rather than folding every
// failure into one generic "not enabled for MCP access" message -- a
// connection that WAS properly set up for MCP but whose policy later lost
// its last active rule (see setAccessPolicyModuleEnabled's own comment on
// why that isn't prevented at the rule-toggle level) needs a different,
// clearer error than one that was simply never opted in to MCP at all.
export function getMcpAccessStatus(id: string): McpAccessStatus {
  const store = readStore();
  const connection = store.connections.find(c => c.id === id);
  if (!connection) return 'not-found';
  if (!connection.mcpEnabled) return 'not-enabled';
  if (!isConnectionPolicyActive(store, connection)) return 'no-active-policy';
  return 'ok';
}

export function registerCredentialIpc(): void {
  console.log(`[credentials] registerCredentialIpc: store path = ${getStorePath()}`);
  ipcMain.handle('credentials:status', () => getCredentialsStatus());
  ipcMain.handle('credentials:list', () => listConnections());
  ipcMain.handle('credentials:save', (_event, input: SaveConnectionInput) => saveConnection(input));
  ipcMain.handle('credentials:get', (_event, id: string) => {
    console.log(`[credentials] getConnection called for id=${id}`);
    return getConnection(id);
  });
  ipcMain.handle('credentials:delete', (_event, id: string) => {
    console.log(`[credentials] forgetConnection called for id=${id}`);
    forgetConnection(id);
  });
  ipcMain.handle('credentials:set-mcp-enabled', (_event, id: string, enabled: boolean) => setMcpEnabled(id, enabled));
  ipcMain.handle('credentials:set-connection-policy', (_event, id: string, policyId: string | null) =>
    setConnectionPolicy(id, policyId),
  );
  ipcMain.handle('credentials:set-bypass-policy-for-own-queries', (_event, id: string, bypass: boolean) =>
    setBypassPolicyForOwnQueries(id, bypass),
  );
  ipcMain.handle('credentials:rename', (_event, id: string, label: string) => renameConnection(id, label));
  ipcMain.handle('access-policy:list', () => listAccessPolicies());
  ipcMain.handle('access-policy:create', (_event, name: string) => createAccessPolicy(name));
  ipcMain.handle('access-policy:rename', (_event, id: string, name: string) => renameAccessPolicy(id, name));
  ipcMain.handle('access-policy:delete', (_event, id: string) => deleteAccessPolicy(id));
  ipcMain.handle(
    'access-policy:set-module-enabled',
    (_event, policyId: string, type: AccessPolicyRule['type'], enabled: boolean) =>
      setAccessPolicyModuleEnabled(policyId, type, enabled),
  );
}
