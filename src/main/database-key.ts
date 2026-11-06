// Which database a connection points at, as a key, and the key's hash.
//
// The key reads like 'postgres://localhost:5432/shop'. beamlynx.db stores
// only its hash, so the file never shows a database's address. Everyone who
// saves from the same database gets the same hash, so their recipes match
// up once recipes are shared.
//
// A hash hides the address from someone reading the file, but it is not a
// secret: anyone who guesses the address can hash it and compare.
//
// This file has no Electron import, so the tests can run it on plain Node.
import { createHash } from 'crypto';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const DEFAULT_PORTS: Record<string, string> = { postgres: '5432', mysql: '3306' };

// The user name is left out, and 127.0.0.1 and ::1 count as localhost, so
// the same database saved two ways has the same key.
export function databaseKeyOf(c: { dbType?: string; dbHost: string; dbPort: string; dbName: string }): string {
  const type = c.dbType || 'postgres';
  // A SQLite database is a file: its key is its path, with no host or port.
  if (type === 'sqlite') {
    return `sqlite://${c.dbName.trim()}`;
  }
  const rawHost = c.dbHost.trim().toLowerCase();
  const host = LOCAL_HOSTS.has(rawHost) ? 'localhost' : rawHost;
  const port = c.dbPort.trim() || DEFAULT_PORTS[type] || '';
  return `${type}://${host}:${port}/${c.dbName.trim()}`;
}

const HASH = /^[0-9a-f]{64}$/;

// SHA-256, as 64 lowercase hex characters.
export function hashKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export function isHashedKey(value: string): boolean {
  return HASH.test(value);
}

// The hash of a key, or the value itself when it already is one. Every
// write goes through this, so nothing is hashed twice.
export function toStoredKey(value: string): string {
  return isHashedKey(value) ? value : hashKey(value);
}

// The values a stored row may hold for this key. A row is matched on both,
// because a file written by an older app, such as after a downgrade, still
// holds the key itself.
export function storedKeyCandidates(key: string): string[] {
  return isHashedKey(key) ? [key] : [hashKey(key), key];
}
