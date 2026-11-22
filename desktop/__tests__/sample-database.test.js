// The sample database (src/main/sample-database.ts): the shop the first-run
// screen offers. Every build must have the same rows and intact foreign keys,
// and a file the person already has must be left alone.
//
// Run with: node --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DIST = path.join(__dirname, '..', 'dist', 'main', 'sample-database.js');
assert.ok(fs.existsSync(DIST), 'dist/main/sample-database.js is missing -- run `npm run build` first (npm test does).');
const { buildSampleDatabase, ensureSampleDatabase, SAMPLE_DATABASE_FILE } = require(DIST);

const TABLES = ['categories', 'products', 'customers', 'orders', 'order_items', 'reviews', 'employees', 'support_tickets'];

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'beamlynx-sample-'));
}

function counts(file) {
  const db = new DatabaseSync(file);
  try {
    return Object.fromEntries(TABLES.map(t => [t, db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n]));
  } finally {
    db.close();
  }
}

test('builds every table, with rows to query and intact foreign keys', () => {
  const file = path.join(tempDir(), 'shop.db');
  buildSampleDatabase(file);
  const n = counts(file);
  for (const t of TABLES) assert.ok(n[t] > 0, `${t} is empty`);
  assert.ok(n.orders >= 500, `only ${n.orders} orders`);

  const db = new DatabaseSync(file);
  try {
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    // Pine draws joins from declared foreign keys.
    const keys = db.prepare("SELECT * FROM pragma_foreign_key_list('order_items')").all();
    assert.deepEqual(keys.map(k => k.table).sort(), ['orders', 'products']);
    // A JSON column, for dotted paths.
    const attributes = JSON.parse(db.prepare('SELECT attributes FROM products WHERE id = 1').get().attributes);
    assert.ok(Array.isArray(attributes.tags));
    // Nothing is left over from the build.
    assert.equal(fs.existsSync(`${file}.building`), false);
  } finally {
    db.close();
  }
});

test('every build has the same rows', () => {
  const dir = tempDir();
  const now = Date.parse('2026-11-22T12:00:00Z');
  buildSampleDatabase(path.join(dir, 'a.db'), now);
  buildSampleDatabase(path.join(dir, 'b.db'), now);
  const rows = file => {
    const db = new DatabaseSync(file);
    try {
      return TABLES.map(t => db.prepare(`SELECT * FROM ${t} ORDER BY id`).all());
    } finally {
      db.close();
    }
  };
  assert.deepEqual(rows(path.join(dir, 'a.db')), rows(path.join(dir, 'b.db')));
});

test('dates count back from when the file is built', () => {
  const file = path.join(tempDir(), 'shop.db');
  const now = Date.parse('2030-01-01T00:00:00Z');
  buildSampleDatabase(file, now);
  const db = new DatabaseSync(file);
  try {
    const latest = db.prepare('SELECT max(ordered_at) AS at FROM orders').get().at;
    assert.ok(latest <= '2030-01-01 00:00:00' && latest >= '2029-12-01', `latest order is ${latest}`);
  } finally {
    db.close();
  }
});

test('ensureSampleDatabase builds the file once and then keeps it', () => {
  const dir = tempDir();
  const file = ensureSampleDatabase(dir);
  assert.equal(file, path.join(dir, SAMPLE_DATABASE_FILE));

  const db = new DatabaseSync(file);
  db.exec("UPDATE customers SET first_name = 'Changed' WHERE id = 1");
  db.close();

  assert.equal(ensureSampleDatabase(dir), file);
  const again = new DatabaseSync(file);
  try {
    assert.equal(again.prepare('SELECT first_name FROM customers WHERE id = 1').get().first_name, 'Changed');
  } finally {
    again.close();
  }
});
