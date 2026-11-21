// CSV export and copy. A database value is untrusted: opened in a
// spreadsheet, one starting with = runs as a formula.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { csvCell } = require('../utils/csv.ts');

test('plain values are written as they are', () => {
  assert.equal(csvCell('Acme'), 'Acme');
  assert.equal(csvCell(42), '42');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
});

test('commas, quotes, newlines and carriage returns are quoted', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('a\nb'), '"a\nb"');
  assert.equal(csvCell('a\rb'), '"a\rb"');
});

test('a value a spreadsheet would run as a formula is neutralised', () => {
  for (const v of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx', '=HYPERLINK("http://x","y")']) {
    const cell = csvCell(v);
    assert.ok(cell.startsWith(`"'`), `${JSON.stringify(v)} -> ${cell}`);
  }
});

test('objects are written as JSON, not [object Object]', () => {
  assert.equal(csvCell({ a: 1 }), '"{""a"":1}"');
  assert.equal(csvCell([1, 2]), '"[1,2]"');
});
