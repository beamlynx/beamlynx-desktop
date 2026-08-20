// Persists saved DB connection profiles to disk in userData/connections.json.
// Only the password is encrypted (via Electron's safeStorage, OS-keychain-backed) --
// host/port/db/user are already visible in plaintext elsewhere (the connect form,
// the connection label), so encrypting them too would only cost a decrypt call
// per row for no real protection gained.
import { randomUUID } from 'crypto';
import { app, ipcMain, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

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
  mcpEnabled: boolean;
};

type StoredConnectionRecord = SavedConnectionMeta & { dbPasswordEncrypted: string };

type StoreFile = { version: 1; connections: StoredConnectionRecord[] };

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

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'connections.json');
}

function emptyStore(): StoreFile {
  return { version: 1, connections: [] };
}

// A corrupt or missing file must never block app boot -- default to empty
// rather than throwing.
function readStore(): StoreFile {
  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.connections)) {
      return emptyStore();
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
  // Records written before this field existed have no mcpEnabled key --
  // default them to false (opt-in, not opt-out) rather than leaving it
  // undefined.
  return { ...meta, mcpEnabled: meta.mcpEnabled ?? false };
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

export function setMcpEnabled(id: string, enabled: boolean): SavedConnectionMeta | null {
  const store = readStore();
  const index = store.connections.findIndex(c => c.id === id);
  if (index < 0) return null;
  store.connections[index] = { ...store.connections[index], mcpEnabled: enabled };
  writeStore(store);
  console.log(`[credentials] setMcpEnabled: id=${id} enabled=${enabled}`);
  return toMeta(store.connections[index]);
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
export function listMcpEnabledConnections(): SavedConnectionMeta[] {
  return listConnections().filter(c => c.mcpEnabled);
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
  ipcMain.handle('credentials:rename', (_event, id: string, label: string) => renameConnection(id, label));
}
