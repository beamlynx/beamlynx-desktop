// A query that ends in `count:` (store/canvas/pine-text.ts). Nothing can
// follow a count, so canvas gestures work on the query without it, and
// CanvasStore.runCommit puts it back at the end.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { endsInCount, withoutEnding } = require('../store/canvas/pine-text.ts');

test('a query ending in count: is counted', () => {
  assert.equal(endsInCount('customers as c | count:'), true);
  assert.equal(endsInCount('customers as c\n | orders .customer_id\n | count: '), true);
  assert.equal(endsInCount('customers as c | count: | where: x = 1'), false);
  assert.equal(endsInCount('customers as c'), false);
});

test('gestures work on the query without its count or describe', () => {
  assert.equal(withoutEnding('customers as c\n | count:'), 'customers as c');
  assert.equal(withoutEnding('customers as c | from: c | describe:'), 'customers as c');
  assert.equal(withoutEnding('customers as c | where: id = 1'), 'customers as c | where: id = 1');
});
