// A where filter built on the canvas can hold several conditions joined with
// `or` (pine-lang #76). These cover the text the canvas writes for one, and
// how an `or` group coming back from the server is shown as a chip.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { whereConditions } = require('../store/client.ts');
const { whereSegmentText, addWhereCondition, updateWhereConditionAt } = require('../store/canvas/pine-actions.ts');
const { buildCanvasGraph } = require('../store/canvas/layout.ts');

const segment = (text, kind, owner) => ({ text, start: -1, end: -1, kind, owner });
const base = segments => ({ expression: '', ast: {}, segments, aliasMap: new Map(), checkpointName: null });
const cond = (alias, column, operator, value) => ({ alias, column, operator, value });

test('one condition is written as before', () => {
  assert.equal(whereSegmentText([cond('c', 'name', '=', 'Acme')]), "where: c.name = 'Acme'");
});

test('several conditions share one where:, joined with or', () => {
  assert.equal(
    whereSegmentText([cond('c', 'status', '=', 'blocked'), cond('c', 'id', '>', '10'), cond('c', 'note', 'is', 'null')]),
    "where: c.status = 'blocked' or c.id > 10 or c.note is null",
  );
});

test('each condition keeps its own alias', () => {
  assert.equal(
    whereSegmentText([cond('c', 'name', 'ilike', '%a%'), cond('e', 'name', 'ilike', '%a%')]),
    "where: c.name ilike '%a%' or e.name ilike '%a%'",
  );
});

test('a quote inside a value is escaped', () => {
  assert.equal(whereSegmentText([cond('c', 'name', '=', "O'Brien")]), "where: c.name = 'O''Brien'");
});

test('adding an or appends one step, not one per condition', () => {
  const text = addWhereCondition(base([segment('company as c', 'table', 'c')]), 'c', [
    cond('c', 'id', '=', '1'),
    cond('c', 'id', '=', '2'),
  ]);
  assert.equal(text, 'company as c | where: c.id = 1 or c.id = 2');
});

test('updating a condition in place can grow it into an or, keeping its position', () => {
  const text = updateWhereConditionAt(
    base([
      segment('company as c', 'table', 'c'),
      segment('where: c.id = 1', 'where', 'c'),
      segment('limit: 5', 'limit', null),
    ]),
    'c',
    0,
    [cond('c', 'id', '=', '1'), cond('c', 'name', '=', 'x')],
  );
  assert.equal(text, "company as c | where: c.id = 1 or c.name = 'x' | limit: 5");
});

test('whereConditions reads a plain condition and an or group alike', () => {
  const a = { alias: 'c', column: 'id', cast: null, operator: '=', value: { type: 'number', value: '1' } };
  const b = { alias: 'c', column: 'id', cast: null, operator: '=', value: { type: 'number', value: '2' } };
  assert.deepEqual(whereConditions(a), [a]);
  assert.deepEqual(whereConditions({ or: [a, b] }), [a, b]);
});

test('an or group is one chip, on the table of its first condition', () => {
  const ast = {
    'selected-tables': [
      { alias: 'c', table: 'company', schema: null },
      { alias: 'e', table: 'employee', schema: null },
    ],
    columns: [],
    joins: [],
    where: [
      { alias: 'c', column: 'country', cast: null, operator: '=', value: { type: 'string', value: 'SE' } },
      {
        or: [
          { alias: 'c', column: 'name', cast: null, operator: 'ILIKE', value: { type: 'string', value: '%a%' } },
          { alias: 'e', column: 'name', cast: null, operator: 'ILIKE', value: { type: 'string', value: '%a%' } },
        ],
      },
    ],
  };
  const chips = alias => buildCanvasGraph(ast, {}, false).nodes.find(n => n.id === alias).data.whereChips;
  assert.deepEqual(chips('c'), ['country = SE', 'name ILIKE %a% or e.name ILIKE %a%']);
  assert.deepEqual(chips('e'), []);
});
