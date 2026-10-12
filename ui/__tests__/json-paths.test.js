// Keys inside a JSON column (pine-lang's JSON paths): `data.address.city`.
// These cover how the canvas names them, writes them back, and keeps their
// result columns from being edited as the whole JSON column.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { columnName, whereLiteral } = require('../store/client.ts');
const { getSelectColumns, getOrderColumns, updateWhereConditionAt } = require('../store/canvas/pine-actions.ts');
const { buildCanvasGraph } = require('../store/canvas/layout.ts');

const segment = (text, kind, owner) => ({ text, start: -1, end: -1, kind, owner });
const base = segments => ({ expression: '', ast: {}, segments, aliasMap: new Map(), checkpointName: null });

test('a path is written the way Pine reads it', () => {
  assert.equal(columnName('data'), 'data');
  assert.equal(columnName('data', ['address', 'city']), 'data.address.city');
  assert.equal(columnName('data', ['tags', 0]), 'data.tags[0]');
  assert.equal(columnName('data', ['first-name']), 'data.first-name');
  assert.equal(columnName('data', ['home address', "it's"]), "data.'home address'.'it''s'");
});

test('a literal sent as JSON for a path is shown decoded', () => {
  assert.equal(whereLiteral({ type: 'jsonb', value: '"SE"', 'json-type': 'string' }), 'SE');
  assert.equal(whereLiteral({ type: 'jsonb', value: '10', 'json-type': 'number' }), '10');
  assert.equal(whereLiteral({ type: 'jsonb', value: 'true', 'json-type': 'boolean' }), 'true');
  // A whole-column comparison stays as written.
  assert.equal(whereLiteral({ type: 'jsonb', value: '{"a":1}' }), '{"a":1}');
  assert.equal(whereLiteral({ type: 'variable', value: 'n' }), '$n');
});

test('chips name the path, not the column it is in', () => {
  const ast = {
    'selected-tables': [{ alias: 'c', table: 'customer', schema: null }],
    columns: [{ alias: 'c', column: 'data', path: ['address', 'city'], 'column-alias': 'data.address.city' }],
    joins: [],
    where: [
      {
        alias: 'c',
        column: 'data',
        path: ['country'],
        cast: null,
        operator: '=',
        value: { type: 'jsonb', value: '"SE"', 'json-type': 'string' },
      },
    ],
    order: [{ alias: 'c', column: 'data', path: ['seats'], direction: 'DESC' }],
  };
  const node = buildCanvasGraph(ast, {}, false).nodes.find(n => n.id === 'c').data;
  assert.deepEqual(node.selectColumns, ['data.address.city']);
  assert.deepEqual(node.whereChips, ['data.country = SE']);
  assert.deepEqual(node.orderChips, ['data.seats DESC']);
});

test('editing a where chip on a path writes the path back', () => {
  const b = base([segment('customer as c', 'table', 'c'), segment("where: c.data.country = 'SE'", 'where', 'c')]);
  assert.equal(
    updateWhereConditionAt(b, 'c', 0, [{ alias: 'c', column: 'data.country', operator: '=', value: 'DK' }]),
    "customer as c | where: c.data.country = 'DK'",
  );
  assert.equal(
    updateWhereConditionAt(b, 'c', 0, [{ alias: 'c', column: 'data.seats', operator: '>', value: '10' }]),
    'customer as c | where: c.data.seats > 10',
  );
});

test('reading back select and order keeps the path', () => {
  const b = base([
    segment('customer as c', 'table', 'c'),
    segment('select: c.id, c.data.plan', 'select', 'c'),
    segment('order: c.data.seats desc', 'order', 'c'),
  ]);
  assert.deepEqual(getSelectColumns(b, 'c'), ['id', 'data.plan']);
  assert.deepEqual(getOrderColumns(b, 'c'), ['data.seats']);
});
