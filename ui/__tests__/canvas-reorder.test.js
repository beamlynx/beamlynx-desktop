// Reordering columns from the canvas: select and group chips, by drag or
// Shift+Left/Right, and which columns an aggregate is offered.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moveItem, moveSelectColumn, moveGroupColumn, editCheckpointGroup } = require('../store/canvas/pine-actions.ts');
const { aggregateReads } = require('../store/canvas/canvas.model.ts');

const segment = (text, kind, owner) => ({ text, kind, owner, start: -1, end: -1 });
const base = (...segments) => ({
  expression: '',
  ast: { 'selected-tables': [{ alias: 'c' }, { alias: 'o' }] },
  segments,
  aliasMap: new Map(),
});

test('an item moves to where another one is', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(moveItem(['a', 'b'], 0, 5), ['a', 'b']);
});

test("a select chip moves among its table's select, names and all", () => {
  const b = base(segment('customers as c', 'table', 'c'), segment('select: c.id, c.name as who, c.email', 'select', 'c'));
  assert.equal(
    moveSelectColumn(b, 'c', { column: 'email', occurrence: 0 }, { column: 'id', occurrence: 0 }),
    'customers as c | select: c.email, c.id, c.name as who',
  );
  // A column selected twice: the second copy moves.
  const twice = base(segment('customers as c', 'table', 'c'), segment('select: c.id, c.name, c.id as again', 'select', 'c'));
  assert.equal(
    moveSelectColumn(twice, 'c', { column: 'id', occurrence: 1 }, { column: 'id', occurrence: 0 }),
    'customers as c | select: c.id as again, c.id, c.name',
  );
});

test("a table's group chip moves to where another of its keys is, in the one group:", () => {
  const b = base(
    segment('customers as c', 'table', 'c'),
    segment('orders as o .customer_id', 'table', 'o'),
    segment('group: c.id, o.status, c.name with count', 'group', 'result_1'),
  );
  assert.equal(
    moveGroupColumn(b, 'c', 'name', 'id'),
    'customers as c | orders as o .customer_id | group: c.name, c.id, o.status with count',
  );
});

test("a group's line reorders its keys across tables, and its aggregates", () => {
  const b = base(
    segment('customers as c', 'table', 'c'),
    segment('group: c.id, c.name with count, max(c.created_at)', 'group', 'result_1'),
    segment('= result_1', 'assign', 'result_1'),
  );
  assert.equal(
    editCheckpointGroup(b, 'result_1', ({ keys, aggregates }) => ({ keys: moveItem(keys, 1, 0), aggregates })),
    'customers as c | group: c.name, c.id with count, max(c.created_at) | = result_1',
  );
  assert.equal(
    editCheckpointGroup(b, 'result_1', ({ keys, aggregates }) => ({ keys, aggregates: moveItem(aggregates, 1, 0) })),
    'customers as c | group: c.id, c.name with max(c.created_at), count | = result_1',
  );
});

test('sum and avg read numbers; min and max anything that sorts', () => {
  assert.equal(aggregateReads('sum', { type: 'numeric' }), true);
  assert.equal(aggregateReads('avg', { type: 'integer' }), true);
  assert.equal(aggregateReads('sum', { type: 'decimal(10,2)' }), true);
  assert.equal(aggregateReads('sum', { type: 'int unsigned' }), true);
  assert.equal(aggregateReads('sum', { type: 'character varying' }), false);
  assert.equal(aggregateReads('avg', { type: 'timestamp' }), false);
  assert.equal(aggregateReads('sum', { type: 'interval' }), true);
  assert.equal(aggregateReads('max', { type: 'timestamp with time zone' }), true);
  assert.equal(aggregateReads('min', { type: 'text' }), true);
  assert.equal(aggregateReads('max', { type: 'boolean' }), false);
  assert.equal(aggregateReads('max', { type: 'uuid' }), false);
  assert.equal(aggregateReads('min', { type: 'integer[]' }), false);
  // JSON, and a column whose type isn't known.
  assert.equal(aggregateReads('max', { json: true }), false);
  assert.equal(aggregateReads('sum', {}), true);
});
