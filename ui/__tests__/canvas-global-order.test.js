// Order is one list for the whole query (beamlynx-plans #28): what was
// picked first sorts first. The canvas writes every table's order items
// into one `order:` at the end of the stage, and a node's order chips are
// the items on its table.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  addOrderColumn,
  getOrderColumns,
  removeOrderColumnAt,
  setOrderDirectionAt,
} = require('../store/canvas/pine-actions.ts');

const segment = (text, kind, owner) => ({ text, start: -1, end: -1, kind, owner });
const tables = ['c', 'e', 'd'].map(alias => ({ alias, table: alias, schema: null }));
const base = segments => ({
  expression: '',
  ast: { 'selected-tables': tables },
  segments,
  aliasMap: new Map(),
});
const joined = (...rest) => [
  segment('company as c', 'table', 'c'),
  segment('employee as e', 'table', 'e'),
  segment('document as d', 'table', 'd'),
  ...rest,
];

test('the first order item goes at the end of the stage, qualified', () => {
  assert.equal(
    addOrderColumn(base(joined()), 'c', 'name', 'desc'),
    'company as c | employee as e | document as d | order: c.name desc',
  );
});

test('a later item from another table follows it in the same order:', () => {
  const b = base(joined(segment('order: c.name desc', 'order', 'd')));
  assert.equal(
    addOrderColumn(b, 'e', 'id', 'asc'),
    'company as c | employee as e | document as d | order: c.name desc, e.id asc',
  );
});

test('the order goes before the limit that ends the stage', () => {
  const b = base(joined(segment('limit: 10', 'limit', 'd')));
  assert.equal(
    addOrderColumn(b, 'e', 'id', 'asc'),
    'company as c | employee as e | document as d | order: e.id asc | limit: 10',
  );
});

test("a node's order chips are the items on its table, in order", () => {
  const b = base(joined(segment('order: c.name desc, e.id asc, c.id', 'order', 'd')));
  assert.deepEqual(getOrderColumns(b, 'c'), ['name', 'id']);
  assert.deepEqual(getOrderColumns(b, 'e'), ['id']);
  assert.deepEqual(getOrderColumns(b, 'd'), []);
});

test("an unqualified item is on the table that owns the step", () => {
  const b = base(joined(segment('order: title', 'order', 'd')));
  assert.deepEqual(getOrderColumns(b, 'd'), ['title']);
  assert.deepEqual(getOrderColumns(b, 'c'), []);
});

test("a chip's direction and × edit its own item in the shared order:", () => {
  const b = base(joined(segment('order: c.name desc, e.id asc, c.id', 'order', 'd')));
  assert.equal(
    setOrderDirectionAt(b, 'c', 1, 'desc'),
    'company as c | employee as e | document as d | order: c.name desc, e.id asc, c.id desc',
  );
  assert.equal(
    removeOrderColumnAt(b, 'e', 0),
    'company as c | employee as e | document as d | order: c.name desc, c.id',
  );
});

test('removing the last item removes the order:', () => {
  const b = base(joined(segment('order: e.id asc', 'order', 'd')));
  assert.equal(removeOrderColumnAt(b, 'e', 0), 'company as c | employee as e | document as d');
});

test('a query with an order: after each table still edits', () => {
  const b = base([
    segment('company as c', 'table', 'c'),
    segment('order: name', 'order', 'c'),
    segment('employee as e', 'table', 'e'),
    segment('order: e.id desc', 'order', 'e'),
  ]);
  assert.deepEqual(getOrderColumns(b, 'c'), ['name']);
  assert.equal(
    removeOrderColumnAt(b, 'c', 0),
    'company as c | employee as e | order: e.id desc',
  );
  assert.equal(
    addOrderColumn(b, 'c', 'id', 'asc'),
    'company as c | order: name | employee as e | order: e.id desc, c.id asc',
  );
});
