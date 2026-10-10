// Editing a key inside a JSON column from the results grid: the edit is
// written as the type the value had, which pine-lang reports per row.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { jsonCellReadOnlyReason, jsonEditLiteral } = require('../store/json-edit.util.ts');

test('a scalar value can be edited; a missing key, an object or an array cannot', () => {
  for (const type of ['string', 'number', 'boolean', 'null']) {
    assert.equal(jsonCellReadOnlyReason('companies[0].id', type), undefined);
  }
  assert.match(
    jsonCellReadOnlyReason('companies[0].id', null),
    /This row's companies has no companies\[0\]\.id/,
  );
  assert.match(
    jsonCellReadOnlyReason('companies[0]', 'object'),
    /holds an object.*Select companies/,
  );
  assert.match(jsonCellReadOnlyReason('data.tags', 'array'), /holds an array.*Select data/);
  assert.match(jsonCellReadOnlyReason('data.x', 'opaque'), /can't be edited here/);
});

test('an edit keeps the type the value had', () => {
  assert.deepEqual(jsonEditLiteral('n', 'string', '5'), { literal: "'5'" });
  assert.deepEqual(jsonEditLiteral('n', 'string', "O'Brien"), { literal: "'O''Brien'" });
  assert.deepEqual(jsonEditLiteral('n', 'number', ' 5 '), { literal: '5' });
  assert.deepEqual(jsonEditLiteral('n', 'number', '-1.25'), { literal: '-1.25' });
  assert.deepEqual(jsonEditLiteral('n', 'boolean', 'TRUE'), { literal: 'true' });
  assert.deepEqual(jsonEditLiteral('n', 'boolean', 'false'), { literal: 'false' });
  // SQLite shows a JSON boolean as 1 or 0.
  assert.deepEqual(jsonEditLiteral('n', 'boolean', '1'), { literal: 'true' });
  assert.deepEqual(jsonEditLiteral('n', 'boolean', '0'), { literal: 'false' });
});

test('a JSON null takes what is typed as a string', () => {
  assert.deepEqual(jsonEditLiteral('n', 'null', '12'), { literal: "'12'" });
});

test('text that does not fit the type is refused, saying why', () => {
  assert.match(
    jsonEditLiteral('data.seats', 'number', 'ten').error,
    /data\.seats holds a number, and "ten" isn't one/,
  );
  assert.match(jsonEditLiteral('n', 'number', '1e5').error, /isn't one/);
  assert.match(jsonEditLiteral('n', 'number', '').error, /isn't one/);
  assert.match(jsonEditLiteral('n', 'boolean', 'yes').error, /true or false/);
});
