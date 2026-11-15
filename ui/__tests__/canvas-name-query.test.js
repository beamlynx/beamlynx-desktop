// The bar's "name" writes `|= name` at the end of a query, so a later query
// can read its result. A query already named is renamed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nameBlock, blockName } = require('../store/canvas/tab-blocks.ts');

test('a query without a name gets one at its end', () => {
  assert.equal(nameBlock('customers as c | limit: 2', 'top'), 'customers as c | limit: 2 |= top');
  assert.equal(blockName(nameBlock('customers as c', 'top')), 'top');
});

test('a named query is renamed, however its |= is spaced', () => {
  assert.equal(nameBlock('customers as c |= old', 'top'), 'customers as c |= top');
  assert.equal(nameBlock('customers as c | = old', 'top'), 'customers as c |= top');
  // A checkpoint's name the canvas wrote in.
  assert.equal(nameBlock('customers as c | limit: 2 |= result_1', 'top'), 'customers as c | limit: 2 |= top');
});

test('a comment at the end stays after the name', () => {
  assert.equal(nameBlock('customers as c -- the big ones', 'top'), 'customers as c |= top -- the big ones');
  assert.equal(nameBlock('customers as c\n', 'top'), 'customers as c |= top\n');
});
