// Persists saved DB connection profiles to disk in connections.json, in the
// installed app's data folder (see getStorePath below).
// Only the password is encrypted (via Electron's safeStorage, OS-keychain-backed) --
// host/port/db/user are already visible in plaintext elsewhere (the connect form,
// the connection label), so encrypting them too would only cost a decrypt call
// per row for no real protection gained.
import { randomUUID } from 'crypto';
import { BrowserWindow, dialog, ipcMain, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getSharedDataDir } from './data-dir';

// Mirrors pine-lang's pine.access-policy rule shape 1:1 (see its
// docs/access-policy.md) -- these travel verbatim (minus `id`, `enabled` and
// `builtIn`, stripped in beamlynx-ui's client.ts effectiveAccessPolicy) as
// the `access-policy` param on pine-lang's /api/v1/build and /api/v1/eval.
// pine-lang carries no policy content of its own; this is the only place it
// lives.
//
// A matcher names some columns. On its own it is a show rule. Wrapped in a
// `hide` rule it hides what it names, whatever any show rule says. Hiding is
// a rule type of its own, not a flag on a matcher: an older pine-lang
// ignores fields it doesn't know, and would read a flagged matcher as a
// show rule.
export type ColumnMatcher =
  | { type: 'column-type'; allow: string[] } // real Postgres type is in `allow`
  | { type: 'foreign-key' } // column is a source column of a detected FK/heuristic relation
  // Column name ends with, contains, or equals a text, ignoring case. One of the three.
  | { type: 'column-name'; suffix?: string; contains?: string; equals?: string }
  // One column of one table. No schema matches the table in any schema.
  | { type: 'column'; schema?: string | null; table: string; column: string };

export type AccessPolicyRule = ColumnMatcher | { type: 'hide'; match: ColumnMatcher };

// One rule of a named policy, as stored: the rule, an id to address it by,
// and whether it's currently on. A built-in rule is one every policy starts
// with; it can be switched off but not removed, since there's no form to
// add it back. pine-lang never sees these three fields, only the rules that
// are on.
export type AccessPolicyModule = AccessPolicyRule & { id: string; enabled: boolean; builtIn?: boolean };

// A named set of rule modules. Either a connection's own policy, or a
// template.
//
// Every connection has a policy of its own (SavedConnectionMeta.policyId
// below), or none at all. No two connections share one, so changing a
// connection's policy never changes what agents see on another. A template
// has no connectionId: it's never applied to a query, only copied into a
// connection when attached to it (attachTemplate). Editing a template
// doesn't change the connections made from it.
//
// Both kinds live in the one `accessPolicies` list, and a connection
// points at its own by policyId, because an older app reading this shared
// file (data-dir.ts) understands exactly that shape: it still applies each
// connection's own rules. It ignores connectionId, and may make connections
// share a policy again; ensureOwnPolicies undoes that on the next read.
export type AccessPolicy = {
  id: string;
  name: string;
  rules: AccessPolicyModule[];
  // The connection this policy belongs to. None on a template.
  connectionId?: string;
  // The template a connection's policy was copied from, for display only.
  template?: { id: string; name: string };
  // Set on the built-in Default template only: it lives in this code, not
  // in the file, and nothing can change it.
  builtIn?: boolean;
};

const isTemplate = (policy: AccessPolicy) => policy.connectionId === undefined;

// The show rules every policy starts with -- the same values pine-lang's
// access-policy POC originally hardcoded, now living here as data instead.
const BUILT_IN_SHOW_RULES: AccessPolicyRule[] = [
  {
    type: 'column-type',
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
  { type: 'foreign-key' },
];

// The built-in rule that showed every column ending in `_id`, whatever its
// type. It showed text such as `national_id` or `passport_id`. Integer and
// uuid ids are shown by type above, and real foreign keys by the rule
// after it, so policies made since have neither. Older policies have it
// switched off once (ensureOwnPolicies, store version 6).
const RETIRED_ID_SUFFIX_RULE: AccessPolicyRule = { type: 'column-name', suffix: '_id' };

// The hide rules every policy starts with. Ordinary rules, unlike the
// built-in show rules: they can be removed, and added back by hand. A uuid
// or integer column called `reset_token` would otherwise be shown by type.
const STARTER_HIDE_RULES: AccessPolicyRule[] = ['token', 'password', 'secret'].map(word => ({
  type: 'hide',
  match: { type: 'column-name', contains: word },
}));

// The starting rules for both the policy seeded on first run ("Default")
// and any policy created afterward (createAccessPolicy). A fresh copy with
// fresh ids each time: once created, a policy's rules are its own.
export function defaultAccessPolicyRules(): AccessPolicyModule[] {
  return [
    ...STARTER_HIDE_RULES.map(rule => ({ ...structuredClone(rule), id: randomUUID(), enabled: true })),
    ...BUILT_IN_SHOW_RULES.map(rule => ({ ...structuredClone(rule), id: randomUUID(), enabled: true, builtIn: true })),
  ];
}

// The Default template. Built in: kept here, never stored, so it can't be
// edited, renamed or deleted, and every new policy made from it starts the
// same. Its rule ids are fixed, so the window can list them stably.
export const BUILT_IN_TEMPLATE_ID = 'builtin:default';
export function builtInTemplate(): AccessPolicy {
  return {
    id: BUILT_IN_TEMPLATE_ID,
    name: 'Default',
    builtIn: true,
    rules: defaultAccessPolicyRules().map((rule, i) => ({ ...rule, id: `${BUILT_IN_TEMPLATE_ID}:${i}` })),
  };
}

function makeDefaultPolicy(rules: AccessPolicyModule[] = defaultAccessPolicyRules()): AccessPolicy {
  return { id: randomUUID(), name: 'Default', rules };
}

// 'sqlite' is a local file: its dbName is the file's absolute path, and its
// dbHost, dbPort, dbUser and password are all empty. It has no secret to
// protect, so a saved SQLite profile never touches the OS credential store.
export type DbType = 'postgres' | 'mysql' | 'sqlite';

export type SavedConnectionMeta = {
  id: string;
  label: string;
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  // Defaults to 'postgres' for records saved before this field existed (see
  // toMeta) -- pine-lang's own createConnection default, so an old record
  // round-trips exactly as it always did. Reconnecting without this was the
  // actual bug behind a saved MySQL profile failing with a confusing
  // "SSL connection" error on relaunch: it silently defaulted back to
  // postgres and tried to speak the Postgres wire protocol to a MySQL
  // server, which happens to fail in an SSL-negotiation-shaped way.
  dbType: DbType;
  createdAt: string;
  lastUsedAt: string;
  // Off by default -- this is the access-control lever for the MCP server
  // (see beamlynx-plans/completed/2026-08-15-mcp-server-and-url-scheme.md).
  // The control-plane server checks this before letting an MCP client touch a
  // connection at all; a connection a user has never explicitly opted in
  // stays invisible to MCP clients regardless of what pine-lang itself allows.
  // Can only be true while `policyId` is a deliberate decision -- either null
  // ("None", picked explicitly in the policy dropdown -- unrestricted access,
  // e.g. a local/sandbox DB the owner doesn't need redacted) or an id that
  // resolves to a policy with an active rule -- see setMcpEnabled and
  // isConnectionPolicyActive. There's no "reachable but undecided" state.
  mcpEnabled: boolean;
  // This connection's own access policy (see AccessPolicy above): never
  // shared with another connection. Required (and, if non-null, required to
  // have an active rule) whenever mcpEnabled is true; attachTemplate refuses
  // a template with no active rule while MCP is on for this connection.
  // null itself is a valid, deliberate value even with MCP on -- see
  // isConnectionPolicyActive -- meaning "None": no redaction, full access.
  // A connection only starts with null when there's no template to copy,
  // so null does double duty as both "undecided" (MCP off) and "explicitly
  // unrestricted" (MCP on) depending on mcpEnabled -- there is no separate
  // state for the former because a connection can't reach mcpEnabled: true
  // without someone having looked at its policy.
  policyId: string | null;
  // Agent access set to "Every column": agents see every column, unmasked,
  // while the policy and its rules stay, to apply again when access goes
  // back to "Masked". Only the window sets it (setAgentAccess). An older
  // app ignores it and applies the policy, which hides more, never less.
  agentsSeeEveryColumn: boolean;
  // Whether the connection owner has switched the assigned policy ON for
  // their own queries too, from any of their own (non-MCP) tabs -- independent
  // of MCP, which always applies the policy unconditionally and never reads
  // this. Defaults to false: the access policy exists to gate what an MCP
  // agent can see, never the owner's own session -- an owner's own tabs
  // always see real data on this connection unless they explicitly opt in to
  // wearing the same restriction (e.g. to preview what the agent sees).
  // Turning this on never weakens what an MCP agent sees on the same
  // connection -- that's governed by mcpEnabled/policyId alone. Moot when
  // policyId is null (nothing to apply either way).
  applyPolicyToOwnQueries: boolean;
};

type StoredConnectionRecord = SavedConnectionMeta & { dbPasswordEncrypted: string };

type StoreFile = { version: number; connections: StoredConnectionRecord[]; accessPolicies: AccessPolicy[] };

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
  // Optional; defaults to 'postgres' (saveConnection) -- matches
  // beamlynx-ui's own client.ts default, so a caller that predates dbType
  // (there's no other one today, but keeps this consistent with
  // SavedConnectionMeta) behaves exactly as it always did.
  dbType?: DbType;
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

// Same shape/reasoning as SetMcpEnabledResult -- attaching a template with
// no active rule while MCP is on for the connection is a second way to
// reach the disallowed "MCP on, no active policy" state, so it needs the
// same explicit refusal rather than silently violating the invariant.
// not-found: no such connection, or no such template.
export type AttachTemplateResult =
  | { ok: true; profile: SavedConnectionMeta }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'mcp-requires-policy' };

// Not userData: a dev build has its own data folder but shares the
// installed app's saved connections (see data-dir.ts). Two copies can use it
// at once: every call reads the file fresh, and writeStore replaces it
// atomically. Two saves at the same instant can still lose one of them.
function getStorePath(): string {
  return path.join(getSharedDataDir(), 'connections.json');
}

function emptyStore(): StoreFile {
  return { version: 6, connections: [], accessPolicies: [] };
}

// A file that can't be read or parsed: unreadable, but maybe still holding
// every saved connection. readStore throws this instead of returning an
// empty store, so no write can replace the file with an empty one.
export class StoreUnreadableError extends Error {
  constructor(storePath: string, cause: unknown) {
    super(
      `Beamlynx couldn't read its saved connections (${storePath}): ` +
        `${cause instanceof Error ? cause.message : String(cause)}. Nothing was changed. ` +
        'Fix or move that file, then try again.',
    );
  }
}

// Only a missing file is an empty store: nothing has been saved yet. A file
// that can't be read or parsed throws StoreUnreadableError. It used to read
// as empty too, and the next save then wrote an empty list over every saved
// connection. Every write starts with readStore, so it stops here first.
// What the app shows at boot goes through readStoreForDisplay, which logs
// and shows nothing rather than keep the app from starting.
//
// Also migrates (once, persisted immediately -- not
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
  const storePath = getStorePath();
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore();
    throw new StoreUnreadableError(storePath, e);
  }
  // Valid JSON, but not a store: just as unsafe to write over.
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.connections)) {
    throw new StoreUnreadableError(storePath, new Error('it has no list of connections'));
  }
  if (!Array.isArray(parsed.accessPolicies)) {
    const migratedRules = Array.isArray(parsed.accessPolicy) ? parsed.accessPolicy : BUILT_IN_SHOW_RULES;
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
  const ruleIds = migrateToRuleIds(parsed);
  const own = ensureOwnPolicies(parsed as StoreFile);
  if (ruleIds || own) {
    writeStore(parsed as StoreFile);
  }
  return parsed as StoreFile;
}

// For lists the app shows at boot: an unreadable file shows as no
// connections, so the app still starts. Writes still refuse (see readStore).
function readStoreForDisplay(): StoreFile {
  try {
    return readStore();
  } catch (e) {
    console.error('[credentials]', e instanceof Error ? e.message : e);
    return emptyStore();
  }
}

// Before rule ids, a policy held at most one rule of each type, addressed
// by its type, and had no hide rules. A policy whose rules lack ids gets
// them, has the show rules it started with marked built-in, and gets the
// starter hide rules, switched on. That only hides more from agents, never
// less.
//
// Per policy, keyed on the missing ids rather than on the store's version:
// an older app sharing this file (data-dir.ts) can still add a policy
// without ids after this one has migrated the rest. A migrated policy has
// ids, so removing a starter rule from it sticks. Returns whether anything
// changed. The version is raised to 2, never lowered.
function migrateToRuleIds(parsed: { version?: unknown; accessPolicies: { rules: Record<string, unknown>[] }[] }): boolean {
  let changed = false;
  for (const policy of parsed.accessPolicies) {
    const rules = Array.isArray(policy.rules) ? policy.rules : [];
    if (Array.isArray(policy.rules) && rules.every(rule => typeof rule.id === 'string')) continue;
    const migrated = rules.map(rule => ({
      ...rule,
      id: typeof rule.id === 'string' ? rule.id : randomUUID(),
      enabled: rule.enabled !== false,
      builtIn: rule.type !== 'hide' && rule.type !== 'column',
    }));
    const has = (rule: AccessPolicyRule) =>
      migrated.some(({ id: _id, enabled: _enabled, builtIn: _builtIn, ...r }) => JSON.stringify(r) === JSON.stringify(rule));
    const hides = STARTER_HIDE_RULES.filter(rule => !has(rule)).map(rule => ({
      ...structuredClone(rule),
      id: randomUUID(),
      enabled: true,
    }));
    policy.rules = [...hides, ...migrated];
    changed = true;
  }
  const version = typeof parsed.version === 'number' ? parsed.version : 1;
  if (version < 2) {
    parsed.version = 2;
    changed = true;
  }
  return changed;
}

// A connection's own copy of a policy, with fresh rule ids. Named for the
// template and the connection, since an older app lists it by name.
function copyForConnection(source: AccessPolicy, connection: { id: string; label: string }): AccessPolicy {
  const template = isTemplate(source) ? { id: source.id, name: source.name } : source.template;
  return {
    id: randomUUID(),
    name: `${template?.name ?? source.name} for ${connection.label}`,
    rules: source.rules.map(rule => ({ ...structuredClone(rule), id: randomUUID() })),
    connectionId: connection.id,
    ...(template ? { template } : {}),
  };
}

// Every connection's policy is its own. A connection that points at a
// template, or at another connection's policy, gets a copy of it, so it
// keeps exactly the rules it had. (The first time, a policy only it uses
// becomes its own instead, see below.) That is the migration from shared
// policies (store version 3), and it also repairs a file an older app
// wrote. A connection pointing at a policy that no longer exists gets none,
// with MCP off, as deleting its policy always did. A connection's policy
// that nothing uses any more is removed. Returns whether anything changed.
function ensureOwnPolicies(store: StoreFile): boolean {
  let changed = false;
  const version = typeof store.version === 'number' ? store.version : 1;
  // The first time only (store version 3): a policy just one connection
  // uses becomes that connection's own, as it is, rather than a copy next
  // to it. 0.68.0's "Copy for this connection" made such policies, and
  // copying them again would leave them in the template list as well.
  // Later reads only copy, so a template an older app points one
  // connection at stays a template.
  if (version < 3) {
    const users = new Map<string, string[]>();
    for (const c of store.connections) {
      if (c.policyId) users.set(c.policyId, [...(users.get(c.policyId) ?? []), c.id]);
    }
    const moved: AccessPolicy[] = [];
    store.accessPolicies = store.accessPolicies.map(policy => {
      const by = users.get(policy.id);
      if (!isTemplate(policy) || by?.length !== 1) return policy;
      moved.push(policy);
      return { ...policy, connectionId: by[0] };
    });
    // Moving mustn't leave nothing for a new connection to start from.
    if (moved.length && !store.accessPolicies.some(isTemplate)) {
      const first = moved[0];
      store.accessPolicies.push({
        id: randomUUID(),
        name: first.name,
        rules: first.rules.map(rule => ({ ...structuredClone(rule), id: randomUUID() })),
      });
    }
    changed = changed || moved.length > 0;
  }
  store.connections = store.connections.map(connection => {
    const policyId = connection.policyId ?? null;
    if (policyId === null) return connection;
    const policy = store.accessPolicies.find(p => p.id === policyId);
    changed = changed || !policy || policy.connectionId !== connection.id;
    if (!policy) return { ...connection, policyId: null, mcpEnabled: false };
    if (policy.connectionId === connection.id) return connection;
    const own = copyForConnection(policy, connection);
    store.accessPolicies.push(own);
    return { ...connection, policyId: own.id };
  });
  const used = new Set(store.connections.map(c => c.policyId));
  const kept = store.accessPolicies.filter(p => isTemplate(p) || used.has(p.id));
  if (kept.length !== store.accessPolicies.length) {
    store.accessPolicies = kept;
    changed = true;
  }
  // Once (store version 5): Default is built in now (builtInTemplate), so
  // a stored template called Default goes. It was editable, and while every
  // policy was shared, "Show to agents" wrote Allow rules into it. Each
  // connection that used it keeps its own copy, made above, with every rule.
  if (version < 5) {
    store.accessPolicies = store.accessPolicies.filter(p => !(isTemplate(p) && p.name === 'Default'));
    store.version = 5;
    changed = true;
  }
  // Once (store version 6): the built-in `_id` rule is switched off in
  // every policy, so a text column ending in `_id` is hidden unless another
  // rule shows it. Left on only where it is the policy's one rule that is
  // on: switching it off there would lock agents out of the connection.
  if (version < 6) {
    const retired = JSON.stringify(RETIRED_ID_SUFFIX_RULE);
    for (const policy of store.accessPolicies) {
      const othersOn = policy.rules.some(m => m.enabled && JSON.stringify(ruleOf(m)) !== retired);
      if (!othersOn) continue;
      policy.rules = policy.rules.map(m =>
        m.builtIn && JSON.stringify(ruleOf(m)) === retired ? { ...m, enabled: false } : m,
      );
    }
    store.version = 6;
    changed = true;
  }
  return changed;
}

// Write-to-temp-then-rename is atomic on POSIX and NTFS, so a hard kill
// mid-write can't leave a truncated/corrupt connections.json behind.
function writeStore(store: StoreFile): void {
  const storePath = getStorePath();
  // Per process, because a dev build and the installed app can both write
  // this file. A shared temp name could have one rename the other's
  // half-written file into place.
  const tmpPath = `${storePath}.${process.pid}.tmp`;
  // A dev build can run before the installed app ever has, so the shared
  // folder may not exist yet.
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  // Readable only by this user: it lists every saved database with its
  // host, name and user (the password itself is encrypted).
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmpPath, storePath);
  try {
    fs.chmodSync(storePath, 0o600);
  } catch {
    // Not supported on every file system; the file is still written.
  }
}

function toMeta(record: StoredConnectionRecord): SavedConnectionMeta {
  const { dbPasswordEncrypted: _dbPasswordEncrypted, ...meta } = record;
  // Records written before these fields existed have neither key -- default
  // each to its protective value (opt-in for mcpEnabled, no policy assigned
  // for policyId, not applied to the owner's own queries for
  // applyPolicyToOwnQueries) rather than leaving it undefined. A record
  // written under the old, inverted `bypassPolicyForOwnQueries` field also
  // has neither key here, so it lands on the same false default -- which is
  // the intended behavior change, not a migration gap: the owner's own
  // session was never meant to be redacted by default.
  const mcpEnabled = meta.mcpEnabled ?? false;
  const policyId = meta.policyId ?? null;
  const applyPolicyToOwnQueries = meta.applyPolicyToOwnQueries ?? false;
  const agentsSeeEveryColumn = meta.agentsSeeEveryColumn ?? false;
  const dbType = meta.dbType ?? 'postgres';
  return { ...meta, mcpEnabled, policyId, applyPolicyToOwnQueries, agentsSeeEveryColumn, dbType };
}

function makeLabel(
  input: Pick<SaveConnectionInput, 'dbUser' | 'dbHost' | 'dbPort' | 'dbName' | 'dbType'>,
): string {
  // A file has no user or server: it is named by its file name.
  if (input.dbType === 'sqlite') {
    return path.basename(input.dbName);
  }
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
  const list = readStoreForDisplay().connections.map(toMeta);
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
  const dbType = input.dbType ?? 'postgres';
  // SQLite has no password, so there is nothing to encrypt, and a profile
  // can be saved even where the OS credential store is unavailable.
  const needsCredentialStore = dbType !== 'sqlite';
  if (needsCredentialStore && !getCredentialsStatus().persistenceAvailable) {
    console.log('[credentials] saveConnection: persistence unavailable, not writing to disk');
    return { persisted: false };
  }

  const dbPasswordEncrypted = needsCredentialStore
    ? safeStorage.encryptString(input.dbPassword).toString('base64')
    : '';
  const now = new Date().toISOString();

  const store = readStore();
  const existingIndex = store.connections.findIndex(
    c =>
      c.dbHost === input.dbHost &&
      c.dbPort === input.dbPort &&
      c.dbName === input.dbName &&
      c.dbUser === input.dbUser &&
      (c.dbType ?? 'postgres') === dbType,
  );

  let record: StoredConnectionRecord;
  if (existingIndex >= 0) {
    record = { ...store.connections[existingIndex], dbPasswordEncrypted, lastUsedAt: now };
    store.connections[existingIndex] = record;
  } else {
    record = {
      id: randomUUID(),
      label: input.label?.trim() || makeLabel({ ...input, dbType }),
      dbHost: input.dbHost,
      dbPort: input.dbPort,
      dbName: input.dbName,
      dbUser: input.dbUser,
      dbType,
      createdAt: now,
      lastUsedAt: now,
      dbPasswordEncrypted,
      mcpEnabled: false,
      // No policy until MCP is turned on for it: the app asks for one then
      // (beamlynx-ui's ConnectionsSection). Until then MCP is off, so no
      // agent can reach it.
      policyId: null,
      applyPolicyToOwnQueries: false,
      agentsSeeEveryColumn: false,
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
  // Only reads, and beamlynx-ui may call it at boot to reopen a tab.
  const store = readStoreForDisplay();
  const record = store.connections.find(c => c.id === id);
  if (!record) {
    return { ok: false, error: 'not-found' };
  }

  // Nothing was encrypted, so there is nothing to decrypt (an empty string
  // is not valid ciphertext, and would read as a decryption failure).
  if (record.dbType === 'sqlite') {
    return { ok: true, profile: toMeta(record), dbPassword: '' };
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
    // Its own policy goes with it.
    const accessPolicies = store.accessPolicies.filter(p => p.connectionId !== id);
    writeStore({ ...store, connections, accessPolicies });
  }
}

function policyIsActive(policy: AccessPolicy | undefined): boolean {
  return !!policy && policy.rules.some(m => m.enabled);
}

// True iff THIS connection's policy decision is one MCP may run behind:
// either policyId is null (the deliberate "None" choice -- unrestricted
// access) or it resolves to a policy with an active rule. The real security
// boundary (see listMcpEnabledConnections/getMcpAccessStatus below), not
// just a precondition setMcpEnabled/attachTemplate check -- MCP always
// reflects a decision someone made, never a stale/undecided id. Per
// connection, not global: each connection is checked against the specific
// policy it points at, not against "does any policy anywhere have a rule on."
function isConnectionPolicyActive(
  store: StoreFile,
  connection: { policyId: string | null; agentsSeeEveryColumn?: boolean },
): boolean {
  if (connection.policyId === null || connection.agentsSeeEveryColumn) return true;
  return policyIsActive(store.accessPolicies.find(p => p.id === connection.policyId));
}

// Refuses (does not flip the flag) turning MCP on for a connection whose
// own assigned policy is a real, named policy with no active rule -- the
// UX-level guard against a toggle that would be silently inert. Does NOT
// refuse when policyId is null: that's the deliberate "None" choice, not an
// oversight -- see isConnectionPolicyActive. Turning MCP off is never
// refused. Never touches policyId itself -- attachTemplate is the
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

// Gives a connection a fresh copy of a template's rules, in place of its
// own policy, or no policy at all (null, "None" -- unrestricted access). The
// connection's old policy is removed: it was its alone. Allowed even while
// mcpEnabled is true -- EXCEPT refuses a template with no active rule while
// mcpEnabled is true for this connection: that would leave MCP behind a
// policy that decides nothing, the same disallowed state setMcpEnabled
// itself guards against from the other direction.
export function attachTemplate(id: string, templateId: string | null): AttachTemplateResult {
  const store = readStore();
  const index = store.connections.findIndex(c => c.id === id);
  if (index < 0) return { ok: false, reason: 'not-found' };
  const template =
    templateId === null
      ? null
      : templateId === BUILT_IN_TEMPLATE_ID
        ? builtInTemplate()
        : store.accessPolicies.find(p => p.id === templateId && isTemplate(p));
  if (template === undefined) return { ok: false, reason: 'not-found' };
  const current = store.connections[index];
  if (current.mcpEnabled && template && !policyIsActive(template)) {
    return { ok: false, reason: 'mcp-requires-policy' };
  }
  const accessPolicies = store.accessPolicies.filter(p => p.connectionId !== id);
  const own = template ? copyForConnection(template, current) : null;
  if (own) accessPolicies.push(own);
  store.connections[index] = { ...current, policyId: own?.id ?? null };
  writeStore({ ...store, accessPolicies });
  console.log(`[credentials] attachTemplate: id=${id} template=${templateId ?? '(none)'}`);
  return { ok: true, profile: toMeta(store.connections[index]) };
}

// Whether THIS connection's owner has switched the assigned policy on for
// their own queries too -- see SavedConnectionMeta.applyPolicyToOwnQueries.
// No precondition of its own, unlike attachTemplate/setMcpEnabled: it
// never affects what MCP sees, only the human's own tabs, so there's
// nothing to guard against.
export function setApplyPolicyToOwnQueries(id: string, apply: boolean): SavedConnectionMeta | null {
  const store = readStore();
  const index = store.connections.findIndex(c => c.id === id);
  if (index < 0) return null;
  store.connections[index] = { ...store.connections[index], applyPolicyToOwnQueries: apply };
  writeStore(store);
  console.log(`[credentials] setApplyPolicyToOwnQueries: id=${id} apply=${apply}`);
  return toMeta(store.connections[index]);
}

export type AgentAccess = 'off' | 'masked' | 'every-column';

export type SetAgentAccessResult =
  | { ok: true; profile: SavedConnectionMeta }
  | { ok: false; reason: 'not-found' | 'needs-template' | 'no-active-policy' };

// What agents can do on a connection, set from its row in the window:
//  - off: MCP is off for it.
//  - masked: agents see what its policy allows. A connection without one
//    gets a copy of `templateId` first; without a template, needs-template.
//    A policy with no rule on is refused, as it would decide nothing.
//  - every-column: agents see every column, unmasked. The policy and its
//    rules stay, and apply again when access goes back to masked.
// Only the window calls this. No control-plane route can, so no agent can
// widen its own access.
export function setAgentAccess(id: string, access: AgentAccess, templateId?: string): SetAgentAccessResult {
  if (access === 'masked') {
    const current = readStore().connections.find(c => c.id === id);
    if (!current) return { ok: false, reason: 'not-found' };
    if (current.policyId === null) {
      if (!templateId) return { ok: false, reason: 'needs-template' };
      const attached = attachTemplate(id, templateId);
      if (!attached.ok) return { ok: false, reason: attached.reason === 'not-found' ? 'not-found' : 'no-active-policy' };
    }
  }
  const store = readStore();
  const index = store.connections.findIndex(c => c.id === id);
  if (index < 0) return { ok: false, reason: 'not-found' };
  const next = {
    ...store.connections[index],
    mcpEnabled: access !== 'off',
    agentsSeeEveryColumn: access === 'every-column',
  };
  if (access === 'masked' && !isConnectionPolicyActive(store, next)) return { ok: false, reason: 'no-active-policy' };
  store.connections[index] = next;
  writeStore(store);
  console.log(`[credentials] setAgentAccess: id=${id} access=${access}`);
  return { ok: true, profile: toMeta(store.connections[index]) };
}

// The built-in Default template first, then the stored templates and
// connections' own policies, told apart by connectionId.
export function listAccessPolicies(): AccessPolicy[] {
  return [builtInTemplate(), ...readStoreForDisplay().accessPolicies];
}

// A new template, with the starting rules.
export function createAccessPolicy(name: string): AccessPolicy {
  const store = readStore();
  const policy: AccessPolicy = {
    id: randomUUID(),
    name: name.trim() || 'Untitled policy',
    rules: defaultAccessPolicyRules(),
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

// Deletes a template. Connections made from it keep their own copies,
// along with the template's name as where they came from. A connection's
// own policy can't be deleted here: attachTemplate(id, null) removes it.
// Returns whether a template was deleted.
export function deleteAccessPolicy(id: string): boolean {
  const store = readStore();
  const policy = store.accessPolicies.find(p => p.id === id);
  if (!policy || !isTemplate(policy)) return false;
  writeStore({ ...store, accessPolicies: store.accessPolicies.filter(p => p.id !== id) });
  console.log(`[credentials] deleteAccessPolicy: id=${id}`);
  return true;
}

// The rule itself, without the fields only this store uses.
function ruleOf(module: AccessPolicyModule): AccessPolicyRule {
  const { id: _id, enabled: _enabled, builtIn: _builtIn, ...rule } = module;
  return rule as AccessPolicyRule;
}

// The exact column a `column` rule names, show or hide, as a comparable key.
function exactColumnKey(rule: AccessPolicyRule): string | null {
  const matcher = rule.type === 'hide' ? rule.match : rule;
  if (matcher?.type !== 'column') return null;
  return JSON.stringify([matcher.schema ?? null, matcher.table, matcher.column]);
}

function updatePolicyRules(
  policyId: string,
  change: (rules: AccessPolicyModule[]) => AccessPolicyModule[],
  log: string,
): AccessPolicy | null {
  const store = readStore();
  const index = store.accessPolicies.findIndex(p => p.id === policyId);
  if (index < 0) return null;
  store.accessPolicies[index] = { ...store.accessPolicies[index], rules: change(store.accessPolicies[index].rules) };
  writeStore(store);
  console.log(`[credentials] ${log}: policyId=${policyId}`);
  return store.accessPolicies[index];
}

// Adds a rule, switched on. A rule the policy already has, switched off or
// on, is switched on instead of added twice. A rule for one exact column
// replaces any other rule for that same column, so a column never has both
// a show and a hide rule of its own -- the results grid's "Show to agents"
// and "Hide from agents" each just write theirs.
export function addAccessPolicyRule(policyId: string, rule: AccessPolicyRule): AccessPolicy | null {
  const key = JSON.stringify(rule);
  const column = exactColumnKey(rule);
  return updatePolicyRules(
    policyId,
    rules => {
      const existing = rules.find(m => JSON.stringify(ruleOf(m)) === key);
      if (existing) return rules.map(m => (m === existing ? { ...m, enabled: true } : m));
      const kept = column ? rules.filter(m => exactColumnKey(ruleOf(m)) !== column) : rules;
      const added: AccessPolicyModule = { ...structuredClone(rule), id: randomUUID(), enabled: true };
      // Hide rules first, as the settings list them: they're checked first.
      return rule.type === 'hide' ? [added, ...kept] : [...kept, added];
    },
    'addAccessPolicyRule',
  );
}

// A built-in rule can't be removed, only switched off.
export function removeAccessPolicyRule(policyId: string, ruleId: string): AccessPolicy | null {
  return updatePolicyRules(
    policyId,
    rules => rules.filter(m => m.id !== ruleId || m.builtIn),
    `removeAccessPolicyRule ruleId=${ruleId}`,
  );
}

// Deliberately does NOT check whether disabling the last active rule here
// would strand an mcpEnabled connection on this policy. That gap is real (a
// policy can go inactive out from under an already-enabled connection this
// way) but is caught at actual MCP call time instead -- see
// getMcpAccessStatus, used by control-plane-server.ts's assertWhitelisted.
export function setAccessPolicyRuleEnabled(policyId: string, ruleId: string, enabled: boolean): AccessPolicy | null {
  return updatePolicyRules(
    policyId,
    rules => rules.map(m => (m.id === ruleId ? { ...m, enabled } : m)),
    `setAccessPolicyRuleEnabled ruleId=${ruleId} enabled=${enabled}`,
  );
}

// Puts back a policy's rules exactly as they were: the Undo of a change made
// from the results grid. Keeps the built-in rules whatever is passed, so
// undo can't lose one.
export function setAccessPolicyRules(policyId: string, rules: AccessPolicyModule[]): AccessPolicy | null {
  if (!Array.isArray(rules)) return null;
  return updatePolicyRules(
    policyId,
    current => {
      const restored = rules.filter(m => m && typeof m.id === 'string' && typeof m.type === 'string');
      const missing = current.filter(m => m.builtIn && !restored.some(r => r.id === m.id));
      return [...restored, ...missing];
    },
    'setAccessPolicyRules',
  );
}

// A connection's label and its own policy, or null if there's no such
// connection. Read-only: what get_access_policy shows an agent, and what an
// agent's proposed change is checked against (control-plane-server.ts).
export function getConnectionPolicy(
  id: string,
): { label: string; policy: AccessPolicy | null; everyColumn: boolean } | null {
  const store = readStore();
  const connection = store.connections.find(c => c.id === id);
  if (!connection) return null;
  const policy = store.accessPolicies.find(p => p.id === connection.policyId && p.connectionId === id) ?? null;
  return { label: connection.label, policy, everyColumn: !policy || !!connection.agentsSeeEveryColumn };
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
// against setMcpEnabled/attachTemplate's toggle-time checks.
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
// its last active rule (see setAccessPolicyRuleEnabled's own comment on
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

// onConnectionAdded is told the database type of each connection that is new
// to the list (not an update of one already saved), for usage stats.
export function registerCredentialIpc(onConnectionAdded?: (dbType: DbType) => void): void {
  console.log(`[credentials] registerCredentialIpc: store path = ${getStorePath()}`);
  ipcMain.handle('credentials:status', () => getCredentialsStatus());
  ipcMain.handle('credentials:list', () => listConnections());
  ipcMain.handle('credentials:pick-sqlite-file', async event => {
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a SQLite database',
      properties: ['openFile'],
      filters: [
        { name: 'SQLite databases', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] },
        { name: 'All files', extensions: ['*'] },
      ],
    };
    const parent = BrowserWindow.fromWebContents(event.sender);
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle('credentials:save', (_event, input: SaveConnectionInput) => {
    const before = listConnections().length;
    const result = saveConnection(input);
    if (result.persisted && listConnections().length > before) onConnectionAdded?.(input.dbType ?? 'postgres');
    return result;
  });
  ipcMain.handle('credentials:get', (_event, id: string) => {
    console.log(`[credentials] getConnection called for id=${id}`);
    return getConnection(id);
  });
  ipcMain.handle('credentials:delete', (_event, id: string) => {
    console.log(`[credentials] forgetConnection called for id=${id}`);
    forgetConnection(id);
  });
  ipcMain.handle('credentials:set-mcp-enabled', (_event, id: string, enabled: boolean) => setMcpEnabled(id, enabled));
  ipcMain.handle('credentials:set-agent-access', (_event, id: string, access: AgentAccess, templateId?: string) =>
    access === 'off' || access === 'masked' || access === 'every-column'
      ? setAgentAccess(id, access, templateId)
      : { ok: false, reason: 'not-found' },
  );
  ipcMain.handle('credentials:attach-template', (_event, id: string, templateId: string | null) =>
    attachTemplate(id, templateId),
  );
  ipcMain.handle('credentials:set-apply-policy-for-own-queries', (_event, id: string, apply: boolean) =>
    setApplyPolicyToOwnQueries(id, apply),
  );
  ipcMain.handle('credentials:rename', (_event, id: string, label: string) => renameConnection(id, label));
  ipcMain.handle('access-policy:list', () => listAccessPolicies());
  ipcMain.handle('access-policy:create', (_event, name: string) => createAccessPolicy(name));
  ipcMain.handle('access-policy:rename', (_event, id: string, name: string) => renameAccessPolicy(id, name));
  ipcMain.handle('access-policy:delete', (_event, id: string) => deleteAccessPolicy(id));
  ipcMain.handle('access-policy:add-rule', (_event, policyId: string, rule: AccessPolicyRule) =>
    addAccessPolicyRule(policyId, rule),
  );
  ipcMain.handle('access-policy:remove-rule', (_event, policyId: string, ruleId: string) =>
    removeAccessPolicyRule(policyId, ruleId),
  );
  ipcMain.handle('access-policy:set-rule-enabled', (_event, policyId: string, ruleId: string, enabled: boolean) =>
    setAccessPolicyRuleEnabled(policyId, ruleId, enabled),
  );
  ipcMain.handle('access-policy:set-rules', (_event, policyId: string, rules: AccessPolicyModule[]) =>
    setAccessPolicyRules(policyId, rules),
  );
}
