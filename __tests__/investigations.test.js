// Notes waiting for an investigation's agent (src/main/mcp/investigations.ts).
// Runs against dist/; `npm test` builds first.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist', 'main', 'mcp', 'investigations.js');
assert.ok(fs.existsSync(DIST), 'dist/main/mcp/investigations.js is missing -- run `npm run build` first (npm test does).');

const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: { ipcMain: { handle: () => {} } },
};

const { addNote, takeNotes, readInvestigationId, INVESTIGATION_HEADER } = require(DIST);

test('notes wait for their own investigation, and are handed over once', () => {
  addNote('inv-a', '  logins are type = auth.login  ');
  addNote('inv-a', 'sort by id');
  addNote('inv-b', 'other session');
  assert.deepEqual(
    takeNotes('inv-a').map(n => n.text),
    ['logins are type = auth.login', 'sort by id'],
  );
  assert.deepEqual(takeNotes('inv-a'), []);
  assert.deepEqual(takeNotes('inv-b').map(n => n.text), ['other session']);
});

test('an empty note is not kept', () => {
  assert.equal(addNote('inv-c', '   '), null);
  assert.deepEqual(takeNotes('inv-c'), []);
});

test('the investigation id is read from its header, and checked', () => {
  assert.equal(readInvestigationId({ [INVESTIGATION_HEADER]: 'a1b2-c3' }), 'a1b2-c3');
  assert.equal(readInvestigationId({}), undefined);
  assert.equal(readInvestigationId({ [INVESTIGATION_HEADER]: 'bad id/../' }), undefined);
  assert.equal(readInvestigationId({ [INVESTIGATION_HEADER]: 'x'.repeat(65) }), undefined);
});
