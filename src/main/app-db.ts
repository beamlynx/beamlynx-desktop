// The app's own data, in one SQLite file: settings, open tabs, column widths,
// and saved recipes. See
// beamlynx-plans/pending/2026-09-27-app-storage-in-sqlite.md and
// beamlynx-plans/pending/2026-10-01-recipes-shared-database-knowledge.md.
//
// This file has no Electron import, so the tests can run it on plain Node.
// app-db-ipc.ts decides where the file lives and exposes it to the renderer.
//
// What never goes in here: result rows from the user's databases, and saved
// connections (those stay in connections.json, see credential-store.ts).
import { randomUUID } from 'crypto';
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
  `
  CREATE TABLE recipe (
    id           TEXT PRIMARY KEY,
    database_key TEXT NOT NULL,              -- see databaseKeyOf
    title        TEXT NOT NULL,
    explanation  TEXT NOT NULL DEFAULT '',
    expression   TEXT NOT NULL,              -- Pine, with $name where a value goes
    inputs       TEXT NOT NULL DEFAULT '[]', -- JSON: RecipeInputDef[]
    author       TEXT NOT NULL,              -- the person who answers for it
    source       TEXT NOT NULL,              -- 'person' or 'agent'
    agent        TEXT,                       -- which agent, when source is 'agent'
    visibility   TEXT NOT NULL DEFAULT 'private',
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );
  CREATE INDEX recipe_by_database ON recipe (database_key, updated_at);
  -- A saved connection that reaches a database under another address, such
  -- as an SSH tunnel on localhost, linked to the database it really is.
  CREATE TABLE database_link (
    connection_id TEXT PRIMARY KEY,
    database_key  TEXT NOT NULL
  );
  `,
];

// Past this many remembered column widths, the least recently used go.
export const COLUMN_WIDTH_CAP = 5000;

const MAX_KEY_LENGTH = 512;
const MAX_VALUE_LENGTH = 5_000_000;

// ---------- recipes ----------

// A value in a recipe's expression that is filled in each time it is used,
// written $name in the expression.
export type RecipeInputDef = {
  name: string;
  example: string;
  kind: 'string' | 'number';
  // The column it filters, such as 'company.name', when known.
  column?: string;
};

// Recipes are global: every recipe is offered on every database. A local,
// staging and production database usually share one schema, and a recipe
// describes the schema, not the server. savedFrom only records where it was
// saved, as context. (Stored in the database_key column, which was written
// when recipes were per database; '' means unknown.)
export type Recipe = {
  id: string;
  savedFrom: string | null;
  title: string;
  explanation: string;
  expression: string;
  inputs: RecipeInputDef[];
  author: string;
  source: 'person' | 'agent';
  agent: string | null;
  visibility: 'private';
  createdAt: number;
  updatedAt: number;
};

export type SaveRecipeInput = {
  // Present to update an existing recipe, absent to create one.
  id?: string;
  // The database it was saved from, from databaseKeyOf. Only used when
  // creating.
  savedFrom?: string | null;
  title: string;
  explanation?: string;
  expression: string;
  inputs?: RecipeInputDef[];
  // Only used when creating. Editing never changes who made a recipe.
  author?: string;
  source?: 'person' | 'agent';
  agent?: string | null;
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const DEFAULT_PORTS: Record<string, string> = { postgres: '5432', mysql: '3306' };

// Which database a saved connection points at, as a string such as
// 'postgres://localhost:5432/shop', recorded as a recipe's savedFrom. The
// user name is left out, and 127.0.0.1 and ::1 count as localhost, so the
// same database saved two ways reads the same.
//
// Migration 2 also created a database_link table and an index by database,
// from when recipes were per database. Nothing uses them now. They stay
// because migrations are only ever appended, never edited.
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

const INPUT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_TITLE = 200;
const MAX_EXPLANATION = 20_000;
const MAX_EXPRESSION = 50_000;
const MAX_INPUTS = 50;

function checkRecipe(input: SaveRecipeInput): void {
  if (input.savedFrom != null && (typeof input.savedFrom !== 'string' || input.savedFrom.length > MAX_KEY_LENGTH)) {
    throw new Error('Invalid database');
  }
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > MAX_TITLE) {
    throw new Error('A recipe needs a title of up to 200 characters');
  }
  if (input.explanation !== undefined && (typeof input.explanation !== 'string' || input.explanation.length > MAX_EXPLANATION)) {
    throw new Error('Invalid explanation');
  }
  if (typeof input.expression !== 'string' || input.expression.length > MAX_EXPRESSION) {
    throw new Error('Invalid expression');
  }
  const inputs = input.inputs ?? [];
  if (!Array.isArray(inputs) || inputs.length > MAX_INPUTS) throw new Error('Invalid inputs');
  const names = new Set<string>();
  for (const i of inputs) {
    if (!i || typeof i.name !== 'string' || !INPUT_NAME.test(i.name)) throw new Error(`Invalid input name: ${i?.name}`);
    if (names.has(i.name)) throw new Error(`Input ${i.name} appears twice`);
    names.add(i.name);
    if (typeof i.example !== 'string' || i.example.length > 1000) throw new Error(`Invalid example for ${i.name}`);
    if (i.kind !== 'string' && i.kind !== 'number') throw new Error(`Invalid kind for ${i.name}`);
    if (i.column !== undefined && (typeof i.column !== 'string' || i.column.length > MAX_KEY_LENGTH)) {
      throw new Error(`Invalid column for ${i.name}`);
    }
  }
  if (input.source !== undefined && input.source !== 'person' && input.source !== 'agent') throw new Error('Invalid source');
}

type RecipeRow = {
  id: string; database_key: string; title: string; explanation: string; expression: string; inputs: string;
  author: string; source: 'person' | 'agent'; agent: string | null; visibility: 'private';
  created_at: number; updated_at: number;
};
const toRecipe = (r: RecipeRow): Recipe => ({
  id: r.id, savedFrom: r.database_key || null, title: r.title, explanation: r.explanation, expression: r.expression,
  inputs: JSON.parse(r.inputs), author: r.author, source: r.source, agent: r.agent, visibility: r.visibility,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

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

  // Every recipe, most recently changed first.
  listRecipes(): Recipe[];
  // Loose search: every word must appear in the title, explanation or query.
  findRecipes(text: string): Recipe[];
  getRecipe(id: string): Recipe | null;
  // Creates the recipe when input.id is absent, otherwise updates its title,
  // explanation, expression and inputs. Returns the stored recipe.
  saveRecipe(input: SaveRecipeInput): Recipe;
  deleteRecipe(id: string): boolean;
  countRecipes(): number;
  close(): void;
};

export function openAppDb(file: string, now: () => number = Date.now): AppDb {
  let wasReset = false;
  let db: DatabaseSync;
  try {
    db = openAndCheck(file);
  } catch (e) {
    // Only a file SQLite says is damaged is moved aside. Anything else, such
    // as a lock held by another copy of the app, is not a reason to set the
    // user's recipes aside, so it fails the open instead.
    if (!isDamaged(e)) throw e;
    console.error(`[app-db] ${file} is damaged, moving it aside and starting empty:`, e);
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
  const allRecipes = db.prepare('SELECT * FROM recipe ORDER BY updated_at DESC');
  const recipeById = db.prepare('SELECT * FROM recipe WHERE id = ?');
  const insertRecipe = db.prepare(
    'INSERT INTO recipe (id, database_key, title, explanation, expression, inputs, author, source, agent, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const updateRecipe = db.prepare(
    'UPDATE recipe SET title = ?, explanation = ?, expression = ?, inputs = ?, updated_at = ? WHERE id = ?',
  );
  const removeRecipe = db.prepare('DELETE FROM recipe WHERE id = ?');
  const countAll = db.prepare('SELECT COUNT(*) AS n FROM recipe');
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

    listRecipes: () => (allRecipes.all() as RecipeRow[]).map(toRecipe),

    findRecipes: text => {
      const words = String(text ?? '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 10);
      const all = (allRecipes.all() as RecipeRow[]).map(toRecipe);
      if (!words.length) return all;
      return all.filter(r => {
        const hay = `${r.title} ${r.explanation} ${r.expression}`.toLowerCase();
        return words.every(w => hay.includes(w));
      });
    },

    getRecipe: id => {
      if (typeof id !== 'string') return null;
      const row = recipeById.get(id) as RecipeRow | undefined;
      return row ? toRecipe(row) : null;
    },

    saveRecipe: input => {
      checkRecipe(input);
      const at = now();
      const inputs = JSON.stringify(input.inputs ?? []);
      const explanation = input.explanation ?? '';
      if (input.id) {
        const existing = recipeById.get(input.id) as RecipeRow | undefined;
        if (!existing) throw new Error('That recipe no longer exists');
        updateRecipe.run(input.title.trim(), explanation, input.expression, inputs, at, input.id);
        return toRecipe(recipeById.get(input.id) as RecipeRow);
      }
      const id = randomUUID();
      const source = input.source ?? 'person';
      insertRecipe.run(
        id, input.savedFrom ?? '', input.title.trim(), explanation, input.expression, inputs,
        input.author ?? 'local', source, source === 'agent' ? (input.agent ?? 'An agent') : null, at, at,
      );
      return toRecipe(recipeById.get(id) as RecipeRow);
    },

    deleteRecipe: id => typeof id === 'string' && Number(removeRecipe.run(id).changes) > 0,

    countRecipes: () => (countAll.get() as { n: number }).n,

    close: () => db.close(),
  };
}

class DamagedFileError extends Error {}

// SQLITE_CORRUPT (11) and SQLITE_NOTADB (26), or a failed quick_check.
function isDamaged(e: unknown): boolean {
  if (e instanceof DamagedFileError) return true;
  const code = (e as { errcode?: number } | null)?.errcode;
  return typeof code === 'number' && [11, 26].includes(code & 0xff);
}

// SQLITE_BUSY (5) and SQLITE_LOCKED (6).
function isBusy(e: unknown): boolean {
  const code = (e as { errcode?: number } | null)?.errcode;
  return typeof code === 'number' && [5, 6].includes(code & 0xff);
}

const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Switching a new file to WAL needs an exclusive lock, and SQLite does not
// wait for one here when another copy of the app is switching the same new
// file at that moment (it fails at once to avoid a deadlock). This only
// happens the first time the file is set up, so a short retry is enough.
function enableWal(db: DatabaseSync): void {
  for (let attempt = 0; ; attempt++) {
    try {
      db.exec('PRAGMA journal_mode = WAL');
      return;
    } catch (e) {
      if (!isBusy(e) || attempt >= 80) throw e;
      sleepSync(25);
    }
  }
}

function openAndCheck(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  try {
    // busy_timeout first: two copies of the app share this file, and every
    // step below can briefly find it locked by the other. Without it,
    // switching to WAL on a new file failed with "database is locked".
    db.exec('PRAGMA busy_timeout = 5000');
    // WAL: a read never waits on a write.
    enableWal(db);
    const check = db.prepare('PRAGMA quick_check').get() as { quick_check: string } | undefined;
    if (check?.quick_check !== 'ok') throw new DamagedFileError(`quick_check: ${check?.quick_check}`);
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}

// Two copies of the app (the installed one and a dev build) share this file
// and may start at the same moment. Each migration reads the version inside
// its own write transaction, so the second copy waits for the first and then
// finds nothing left to do, instead of creating the same tables twice.
function migrate(db: DatabaseSync): void {
  const versionNow = () => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (;;) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const version = versionNow();
      // Done, or a newer build migrated this file. Its extra tables are left
      // alone, and this build keeps using the ones it knows.
      if (version >= MIGRATIONS.length) {
        db.exec('COMMIT');
        return;
      }
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

// The old file is never deleted. It is kept as <file>.bad, so recipes in it
// can still be recovered, and the app says once that it started over.
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
