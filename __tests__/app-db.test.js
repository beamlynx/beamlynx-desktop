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

// ---------- recipes ----------
const { databaseKeyOf } = require(DIST);

test('a database key leaves out the login and treats 127.0.0.1 as localhost', () => {
  const a = databaseKeyOf({ dbType: 'postgres', dbHost: '127.0.0.1', dbPort: '5432', dbName: 'shop' });
  const b = databaseKeyOf({ dbType: 'postgres', dbHost: 'LOCALHOST', dbPort: '5432', dbName: 'shop' });
  assert.equal(a, 'postgres://localhost:5432/shop');
  assert.equal(a, b);
  assert.equal(databaseKeyOf({ dbHost: 'db.example.internal', dbPort: '', dbName: 'shop' }), 'postgres://db.example.internal:5432/shop');
  assert.equal(databaseKeyOf({ dbType: 'mysql', dbHost: 'localhost', dbPort: '', dbName: 'billing' }), 'mysql://localhost:3306/billing');
});

const recipeInput = (over = {}) => ({
  savedFrom: 'postgres://staging.example.internal:5432/shop',
  title: 'Failed requests for a company',
  explanation: 'Requests belong to tenants, not companies.',
  expression: "company | where: name = $company_name | tenant .company_id | request .tenant_id | where: status = 'failed'",
  inputs: [{ name: 'company_name', example: 'Acme', kind: 'string', column: 'company.name' }],
  ...over,
});

test('recipes are global: every recipe is listed, whichever database it was saved from', () => {
  let t = 0;
  let db = openAppDb(file, () => ++t);
  const staging = db.saveRecipe(recipeInput());
  const unknown = db.saveRecipe(recipeInput({ savedFrom: undefined, title: 'From nowhere in particular' }));
  assert.match(staging.id, /^[0-9a-f-]{36}$/);
  assert.equal(staging.savedFrom, 'postgres://staging.example.internal:5432/shop');
  assert.equal(unknown.savedFrom, null);
  assert.equal(staging.source, 'person');
  assert.equal(staging.author, 'local');
  assert.equal(staging.visibility, 'private');
  db.close();

  db = openAppDb(file);
  assert.deepEqual(db.listRecipes().map(r => r.title), ['From nowhere in particular', 'Failed requests for a company']);
  assert.deepEqual(db.getRecipe(staging.id), staging);
  assert.equal(db.countRecipes(), 2);
  db.close();
});

test('updating a recipe keeps who made it, when, and where it was saved from', () => {
  let t = 0;
  const db = openAppDb(file, () => ++t);
  const made = db.saveRecipe(recipeInput({ source: 'agent', agent: 'Claude Code 2.4.1', author: 'local' }));
  const edited = db.saveRecipe({ id: made.id, savedFrom: 'postgres://elsewhere:5432/x', title: 'Failed requests', expression: made.expression, inputs: made.inputs });
  assert.equal(edited.title, 'Failed requests');
  assert.equal(edited.source, 'agent');
  assert.equal(edited.agent, 'Claude Code 2.4.1');
  assert.equal(edited.savedFrom, made.savedFrom);
  assert.equal(edited.createdAt, made.createdAt);
  assert.ok(edited.updatedAt > made.updatedAt);
  assert.throws(() => db.saveRecipe({ ...recipeInput(), id: 'not-a-recipe' }), /no longer exists/);
  db.close();
});

test('a recipe with a bad title, input name or duplicate input is refused', () => {
  const db = openAppDb(file);
  assert.throws(() => db.saveRecipe(recipeInput({ title: '   ' })), /title/);
  assert.throws(() => db.saveRecipe(recipeInput({ inputs: [{ name: '1bad', example: '', kind: 'string' }] })), /input name/);
  assert.throws(() => db.saveRecipe(recipeInput({
    inputs: [{ name: 'a', example: '', kind: 'string' }, { name: 'a', example: '', kind: 'string' }],
  })), /twice/);
  assert.throws(() => db.saveRecipe(recipeInput({ inputs: [{ name: 'a', example: '', kind: 'date' }] })), /kind/);
  assert.equal(db.countRecipes(), 0);
  db.close();
});

test('finding recipes needs every word, and an empty search lists them all', () => {
  const db = openAppDb(file);
  db.saveRecipe(recipeInput());
  db.saveRecipe(recipeInput({ title: 'Admins of a company', explanation: '', expression: "user | where: role = 'admin'", inputs: [] }));
  assert.deepEqual(db.findRecipes('FAILED company').map(r => r.title), ['Failed requests for a company']);
  assert.equal(db.findRecipes('company').length, 2);
  assert.deepEqual(db.findRecipes('admin tenant'), []);
  assert.equal(db.findRecipes('').length, 2);
  db.close();
});

test('deleting a recipe removes only that one', () => {
  const db = openAppDb(file);
  const a = db.saveRecipe(recipeInput());
  const b = db.saveRecipe(recipeInput({ title: 'Another' }));
  assert.equal(db.deleteRecipe(a.id), true);
  assert.equal(db.deleteRecipe(a.id), false);
  assert.equal(db.getRecipe(a.id), null);
  assert.equal(db.getRecipe(b.id).title, 'Another');
  db.close();
});

test('a file from the first version gains the recipe tables and keeps its settings', () => {
  const raw = new DatabaseSync(file);
  raw.exec(`CREATE TABLE preference (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE column_width (connection TEXT NOT NULL, column_key TEXT NOT NULL, width INTEGER NOT NULL, used_at INTEGER NOT NULL, PRIMARY KEY (connection, column_key));
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO preference VALUES ('pine-theme', '"sepia"', 1);
    PRAGMA user_version = 1;`);
  raw.close();
  const db = openAppDb(file);
  assert.deepEqual(db.loadPreferences(), { 'pine-theme': '"sepia"' });
  db.saveRecipe(recipeInput());
  assert.equal(db.countRecipes(), 1);
  db.close();
});

test('two copies can have the file open at once', () => {
  const a = openAppDb(file);
  const b = openAppDb(file);
  const saved = a.saveRecipe(recipeInput());
  assert.equal(b.getRecipe(saved.id).title, saved.title);
  b.setPreferences({ x: '1' });
  assert.deepEqual(a.loadPreferences(), { x: '1' });
  a.close(); b.close();
});
