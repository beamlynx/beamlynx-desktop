// Editing a group from its line on the canvas: the keys, and each
// aggregate's function and column.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseAggregate,
  formatAggregate,
  aggregateName,
  withAggregate,
  editCheckpointGroup,
} = require('../store/canvas/pine-actions.ts');

test('an aggregate splits into its function, column, filter and name', () => {
  assert.deepEqual(parseAggregate('count'), { fn: 'count' });
  assert.deepEqual(parseAggregate('sum(o.total) as total'), { fn: 'sum', arg: 'o.total', name: 'total' });
  assert.deepEqual(parseAggregate("count where o.status = 'paid' as paid"), {
    fn: 'count',
    filter: "o.status = 'paid'",
    name: 'paid',
  });
  assert.deepEqual(parseAggregate('o.total => max'), { fn: 'max', arg: 'o.total' });
  // Two calls joined by `or` are not one function of one value.
  assert.equal(parseAggregate('any(a) or any(b)'), null);
  assert.equal(formatAggregate({ fn: 'sum', arg: 'o.total', filter: 'o.paid', name: 't' }), 'sum(o.total) where o.paid as t');
});

test("an aggregate's column is its name, or the function and the column it reads", () => {
  assert.equal(aggregateName({ fn: 'count' }), 'count');
  assert.equal(aggregateName({ fn: 'sum', arg: 'o.total_amount' }), 'sum_total_amount');
  assert.equal(aggregateName({ fn: 'sum', arg: 'o.total', name: 'total' }), 'total');
});

test('changing an aggregate keeps its name only when a later step uses it', () => {
  assert.deepEqual(withAggregate(['count'], 0, { fn: 'sum', arg: 'o.total' }, ''), ['sum(o.total)']);
  assert.deepEqual(withAggregate(['count'], 0, { fn: 'sum', arg: 'o.total' }, 'where: count > 2'), [
    'sum(o.total) as count',
  ]);
  // An index past the end adds one.
  assert.deepEqual(withAggregate(['count'], 1, { fn: 'max', arg: 'o.total' }, ''), ['count', 'max(o.total)']);
});

test('a second aggregate of the same name gets a number', () => {
  assert.deepEqual(withAggregate(['count'], 1, { fn: 'count' }, ''), ['count', 'count as count_2']);
  assert.deepEqual(withAggregate(['count', 'count as count_2'], 2, { fn: 'count' }, ''), [
    'count',
    'count as count_2',
    'count as count_3',
  ]);
});

const segment = (text, kind, owner) => ({ text, kind, owner, start: -1, end: -1 });
const base = (...segments) => ({ expression: '', ast: {}, segments, aliasMap: new Map() });
const GROUPED = base(
  segment('company as c', 'table', 'c'),
  segment('group: c.name, c.id with count', 'group', 'result_1'),
  segment('= result_1', 'assign', 'result_1'),
);

test("a group's keys and aggregates are rewritten in place", () => {
  assert.equal(
    editCheckpointGroup(GROUPED, 'result_1', ({ keys, aggregates }) => ({ keys: keys.slice(1), aggregates })),
    'company as c | group: c.id with count | = result_1',
  );
  // Without keys, the aggregates are over every row.
  assert.equal(
    editCheckpointGroup(GROUPED, 'result_1', ({ aggregates }) => ({ keys: [], aggregates })),
    'company as c | group: with count | = result_1',
  );
  // With neither, the group goes.
  assert.equal(editCheckpointGroup(GROUPED, 'result_1', () => ({ keys: [], aggregates: [] })), 'company as c');
});
