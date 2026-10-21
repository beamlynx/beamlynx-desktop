// Two things pine-lang can now write that the canvas edits: `nulls first`
// after an order: item (pine-lang #142), and a function on the left of a
// where: condition, `jsonb_typeof(c.data) = 'array'` (pine-lang #144).
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  splitOrderItem,
  getOrderColumns,
  setOrderDirectionAt,
  whereSegmentText,
  updateWhereConditionAt,
} = require('../store/canvas/pine-actions.ts');
const { buildCanvasGraph } = require('../store/canvas/layout.ts');

const segment = (text, kind, owner) => ({ text, start: -1, end: -1, kind, owner });
const base = segments => ({
  expression: '',
  ast: {},
  segments,
  aliasMap: new Map(),
  checkpointName: null,
});

test('an order item splits into its column, direction and null ordering', () => {
  assert.deepEqual(splitOrderItem('c.name'), { column: 'c.name' });
  assert.deepEqual(splitOrderItem('c.name DESC'), { column: 'c.name', direction: 'desc' });
  assert.deepEqual(splitOrderItem('c.name asc nulls first'), {
    column: 'c.name',
    direction: 'asc',
    nulls: 'first',
  });
  assert.deepEqual(splitOrderItem('c.name nulls last'), { column: 'c.name', nulls: 'last' });
  assert.deepEqual(splitOrderItem('data.seats DESC nulls first'), {
    column: 'data.seats',
    direction: 'desc',
    nulls: 'first',
  });
});

test('the ordered columns leave out the null ordering', () => {
  const b = base([
    segment('company as c', 'table', 'c'),
    segment('order: c.name asc nulls first, c.id', 'order', 'c'),
  ]);
  assert.deepEqual(getOrderColumns(b, 'c'), ['name', 'id']);
});

test('flipping the direction keeps nulls first', () => {
  const b = base([
    segment('company as c', 'table', 'c'),
    segment('order: c.name asc nulls first, c.id', 'order', 'c'),
  ]);
  assert.equal(
    setOrderDirectionAt(b, 'c', 0, 'desc'),
    'company as c | order: c.name desc nulls first, c.id',
  );
  assert.equal(
    setOrderDirectionAt(b, 'c', 1, 'asc'),
    'company as c | order: c.name asc nulls first, c.id asc',
  );
});

test('an order chip shows the null ordering', () => {
  const ast = {
    'selected-tables': [{ alias: 'c', table: 'company', schema: null }],
    columns: [],
    joins: [],
    where: [],
    order: [{ alias: 'c', column: 'company_id', direction: 'ASC', nulls: 'FIRST' }],
  };
  const node = buildCanvasGraph(ast, {}, false).nodes.find(n => n.id === 'c').data;
  assert.deepEqual(node.orderChips, ['company_id ASC nulls first']);
});

test('a function on the left is written back without an alias in front', () => {
  // pine-lang reports it with the call as Pine in `column`.
  assert.equal(
    whereSegmentText([
      { alias: 'c_0', column: 'jsonb_typeof(c_0.data)', operator: '=', value: 'object' },
    ]),
    "where: jsonb_typeof(c_0.data) = 'object'",
  );
  const b = base([
    segment('customer', 'table', 'c_0'),
    segment("where: jsonb_typeof(c_0.data) = 'array'", 'where', 'c_0'),
  ]);
  assert.equal(
    updateWhereConditionAt(b, 'c_0', 0, [
      { alias: 'c_0', column: 'jsonb_typeof(c_0.data)', operator: '=', value: 'object' },
    ]),
    "customer | where: jsonb_typeof(c_0.data) = 'object'",
  );
});
