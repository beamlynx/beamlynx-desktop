// The app's own data, in one SQLite file: settings, open tabs, column widths,
// and later saved recipes. See
// beamlynx-plans/pending/2026-09-27-app-storage-in-sqlite.md.
//
// This file has no Electron import, so the tests can run it on plain Node.
// app-db-ipc.ts decides where the file lives and exposes it to the renderer.
//
// What never goes in here: result rows from the user's databases, and saved
// connections (those stay in connections.json, see credential-store.ts).
import * as fs from 'fs';
import { DatabaseSync } from 'node:sqlite';

// Each entry runs once, in order, and PRAGMA user_version records how many
// have run. Only ever append. Migrations must also be additive (new tables
// and columns, never renames or drops), because an older build can still
// open a file a newer build has migrated, for example after a downgrade, and
// it has to keep working with the tables it knows.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE preference (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE column_width (
    connection TEXT NOT NULL,
    column_key TEXT NOT NULL,
    width      INTEGER NOT NULL,
    used_at    INTEGER NOT NULL,
    PRIMARY KEY (connection, column_key)
  );
  CREATE INDEX column_width_used_at ON column_width (used_at);
  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

// Past this many remembered column widths, the least recently used go.
export const COLUMN_WIDTH_CAP = 5000;

const MAX_KEY_LENGTH = 512;
const MAX_VALUE_LENGTH = 5_000_000;

export type AppDbStatus = {
  // True when the file was unreadable and was moved aside to <file>.bad, so
  // the app started with empty settings. The UI says so once.
  wasReset: boolean;
  // Whether this file has already taken in the renderer's old localStorage
  // values. The import runs once per file.
  importedFromLocalStorage: boolean;
};

export type AppDb = {
  status(): AppDbStatus;
  // Every preference, as the JSON text the renderer stored.
  loadPreferences(): Record<string, string>;
  // A null value deletes the key. All changes in one call are one write.
  setPreferences(changes: Record<string, string | null>): void;
  getColumnWidths(connection: string): Record<string, number>;
  // A null width forgets the column. Prunes past COLUMN_WIDTH_CAP.
  setColumnWidths(connection: string, changes: Record<string, number | null>): void;
  markImportedFromLocalStorage(): void;
  close(): void;
};

export function openAppDb(file: string, now: () => number = Date.now): AppDb {
  let wasReset = false;
  let db: DatabaseSync;
  try {
    db = openAndCheck(file);
  } catch (e) {
    console.error(`[app-db] ${file} could not be opened, moving it aside and starting empty:`, e);
    moveAside(file);
    wasReset = true;
    db = openAndCheck(file);
  }
  migrate(db);

  const getMeta = db.prepare('SELECT value FROM meta WHERE key = ?');
  const setMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
  const allPreferences = db.prepare('SELECT key, value FROM preference');
  const upsertPreference = db.prepare(
    'INSERT INTO preference (key, value, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  );
  const deletePreference = db.prepare('DELETE FROM preference WHERE key = ?');
  const widthsFor = db.prepare('SELECT column_key, width FROM column_width WHERE connection = ?');
  const upsertWidth = db.prepare(
    'INSERT INTO column_width (connection, column_key, width, used_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT (connection, column_key) DO UPDATE SET width = excluded.width, used_at = excluded.used_at',
  );
  const deleteWidth = db.prepare('DELETE FROM column_width WHERE connection = ? AND column_key = ?');
  const countWidths = db.prepare('SELECT COUNT(*) AS n FROM column_width');
  const pruneWidths = db.prepare(
    'DELETE FROM column_width WHERE rowid IN (SELECT rowid FROM column_width ORDER BY used_at ASC LIMIT ?)',
  );

  const inTransaction = (fn: () => void) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      fn();
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };

  return {
    status: () => ({
      wasReset,
      importedFromLocalStorage: getMeta.get('importedFromLocalStorage') !== undefined,
    }),

    loadPreferences: () => {
      const result: Record<string, string> = {};
      for (const row of allPreferences.all() as { key: string; value: string }[]) result[row.key] = row.value;
      return result;
    },

    setPreferences: changes => {
      const entries = Object.entries(changes);
      for (const [key, value] of entries) {
        checkKey(key);
        if (value !== null) checkValue(value);
      }
      const at = now();
      inTransaction(() => {
        for (const [key, value] of entries) {
          if (value === null) deletePreference.run(key);
          else upsertPreference.run(key, value, at);
        }
      });
    },

    getColumnWidths: connection => {
      checkKey(connection);
      const result: Record<string, number> = {};
      for (const row of widthsFor.all(connection) as { column_key: string; width: number }[]) {
        result[row.column_key] = row.width;
      }
      return result;
    },

    setColumnWidths: (connection, changes) => {
      checkKey(connection);
      const entries = Object.entries(changes);
      for (const [key, width] of entries) {
        checkKey(key);
        if (width !== null && !(Number.isInteger(width) && width > 0 && width < 100_000)) {
          throw new Error(`Invalid column width for ${key}: ${width}`);
        }
      }
      const at = now();
      inTransaction(() => {
        for (const [key, width] of entries) {
          if (width === null) deleteWidth.run(connection, key);
          else upsertWidth.run(connection, key, width, at);
        }
        const { n } = countWidths.get() as { n: number };
        if (n > COLUMN_WIDTH_CAP) pruneWidths.run(n - COLUMN_WIDTH_CAP);
      });
    },

    markImportedFromLocalStorage: () => {
      setMeta.run('importedFromLocalStorage', String(now()));
    },

    close: () => db.close(),
  };
}

function openAndCheck(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  try {
    // WAL: a read never waits on a write. busy_timeout covers the moment two
    // copies of the app (or the app and a future reader) both write.
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 2000');
    const check = db.prepare('PRAGMA quick_check').get() as { quick_check: string } | undefined;
    if (check?.quick_check !== 'ok') throw new Error(`quick_check: ${check?.quick_check}`);
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}

function migrate(db: DatabaseSync): void {
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  // A newer build migrated this file. Its extra tables are left alone, and
  // this build keeps using the ones it knows.
  if (version >= MIGRATIONS.length) return;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

// Everything in the file is a preference, so losing it is an annoyance, not
// data loss. The old file is kept as <file>.bad in case someone wants to look.
function moveAside(file: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const from = file + suffix;
    if (fs.existsSync(from)) fs.renameSync(from, `${file}.bad${suffix}`);
  }
}

function checkKey(key: unknown): void {
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) {
    throw new Error('Invalid key');
  }
}

function checkValue(value: unknown): void {
  if (typeof value !== 'string' || value.length > MAX_VALUE_LENGTH) throw new Error('Invalid value');
}
