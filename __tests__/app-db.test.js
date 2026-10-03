// Tests for the app's own SQLite file (src/main/app-db.ts). Runs the real
// compiled module against a temp file per test. app-db.ts has no Electron
// import, so nothing needs stubbing.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DIST = path.join(__dirname, '..', 'dist', 'main', 'app-db.js');
assert.ok(fs.existsSync(DIST), 'dist/main/app-db.js is missing -- run `npm run build` first (npm test does).');
const { openAppDb, COLUMN_WIDTH_CAP } = require(DIST);

let dir;
let file;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-db-test-'));
  file = path.join(dir, 'beamlynx.db');
});

test('a new file starts empty and remembers preferences across reopen', () => {
  let db = openAppDb(file);
  assert.deepEqual(db.loadPreferences(), {});
  assert.deepEqual(db.status(), { wasReset: false, importedFromLocalStorage: false });
  db.setPreferences({ 'pine-theme': '"dark"', 'pine-text-size': '14' });
  db.close();

  db = openAppDb(file);
  assert.deepEqual(db.loadPreferences(), { 'pine-theme': '"dark"', 'pine-text-size': '14' });
  db.close();
});

test('a null preference deletes it, and other keys stay', () => {
  const db = openAppDb(file);
  db.setPreferences({ a: '1', b: '2' });
  db.setPreferences({ a: null, b: '3' });
  assert.deepEqual(db.loadPreferences(), { b: '3' });
  db.close();
});

test('an invalid change writes nothing at all', () => {
  const db = openAppDb(file);
  db.setPreferences({ a: '1' });
  assert.throws(() => db.setPreferences({ a: '2', '': 'x' }));
  assert.throws(() => db.setPreferences({ a: '2', b: 42 }));
  assert.deepEqual(db.loadPreferences(), { a: '1' });
  db.close();
});

test('the file uses WAL', () => {
  openAppDb(file).close();
  const raw = new DatabaseSync(file);
  assert.equal(raw.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  raw.close();
});

test('an unreadable file is moved aside and the app starts empty', () => {
  fs.writeFileSync(file, 'this is not a sqlite database, just some bytes'.repeat(200));
  const db = openAppDb(file);
  assert.equal(db.status().wasReset, true);
  assert.deepEqual(db.loadPreferences(), {});
  db.setPreferences({ a: '1' });
  db.close();
  assert.ok(fs.existsSync(`${file}.bad`), 'the old file is kept as .bad');
  assert.equal(openAppDb(file).status().wasReset, false, 'a healthy file is not reset again');
});

test('a file migrated by a newer build still opens and keeps working', () => {
  openAppDb(file).close();
  const raw = new DatabaseSync(file);
  raw.exec('CREATE TABLE from_the_future (x INTEGER); PRAGMA user_version = 99');
  raw.close();

  const db = openAppDb(file);
  db.setPreferences({ a: '1' });
  assert.deepEqual(db.loadPreferences(), { a: '1' });
  db.close();
  const after = new DatabaseSync(file);
  assert.equal(after.prepare('PRAGMA user_version').get().user_version, 99, 'the newer version is left alone');
  after.close();
});

test('column widths are kept per connection', () => {
  const db = openAppDb(file);
  db.setColumnWidths('postgres://h:5432/a', { 'public.user.email': 240, 'expr:count': 80 });
  db.setColumnWidths('postgres://h:5432/b', { 'public.user.email': 120 });
  db.setColumnWidths('postgres://h:5432/a', { 'expr:count': null });
  assert.deepEqual(db.getColumnWidths('postgres://h:5432/a'), { 'public.user.email': 240 });
  assert.deepEqual(db.getColumnWidths('postgres://h:5432/b'), { 'public.user.email': 120 });
  assert.throws(() => db.setColumnWidths('c', { x: -5 }));
  assert.throws(() => db.setColumnWidths('c', { x: 1.5 }));
  db.close();
});

test('past the cap, the least recently used column widths go first', () => {
  let t = 0;
  const db = openAppDb(file, () => ++t);
  db.setColumnWidths('old', { first: 100 });
  const many = {};
  for (let i = 0; i < COLUMN_WIDTH_CAP; i++) many[`c${i}`] = 100;
  db.setColumnWidths('new', many);
  assert.deepEqual(db.getColumnWidths('old'), {}, 'the oldest width was dropped');
  assert.equal(Object.keys(db.getColumnWidths('new')).length, COLUMN_WIDTH_CAP);
  db.close();
});

test('the localStorage import is recorded once per file', () => {
  let db = openAppDb(file);
  db.markImportedFromLocalStorage();
  db.close();
  db = openAppDb(file);
  assert.equal(db.status().importedFromLocalStorage, true);
  db.close();
});
