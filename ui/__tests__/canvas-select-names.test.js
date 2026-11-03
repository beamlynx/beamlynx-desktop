// A select column on the canvas can be picked more than once, each copy
// with its own name given with `as`. A click in the picker always adds; a
// chip's × removes that one copy; a chip's click edits its name.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { segmentsFromAst } = require('../store/canvas/pine-text.ts');
const { buildCanvasGraph } = require('../store/canvas/layout.ts');
const actions = require('../store/canvas/pine-actions.ts');

// pine-lang's /build for this expression.
const expression = 'company as c | s: c.id, c.id as company_id, c.created_at => month, c.data.plan';
const ast = {
  'selected-tables': [{ schema: null, table: 'company', alias: 'c' }],
  current: 'c',
  context: null,
  ranges: [
    { alias: 'c', start: { line: 0, character: 0 }, end: { line: 0, character: 12 } },
    { alias: 'c', start: { line: 0, character: 15 }, end: { line: 0, character: expression.length } },
  ],
  columns: [
    { alias: 'c', column: 'id' },
    { alias: 'c', column: 'id', 'column-alias': 'company_id' },
    // Pine names these itself: not a name the user gave.
    { alias: 'c', column: 'created_at', 'column-alias': 'month', 'col-fn': 'month' },
    { alias: 'c', column: 'data', path: ['plan'], 'column-alias': 'data.plan' },
  ],
  unnests: [],
  checkpoints: [],
  where: [],
  order: [],
  group: [],
  joins: [],
};
const base = () => ({ expression, ast, segments: segmentsFromAst(expression, ast), aliasMap: new Map() });

test('chips list every copy of a column, with only the names the user gave', () => {
  const node = buildCanvasGraph(ast, {}, false).nodes.find(n => n.id === 'c');
  assert.deepEqual(node.data.selectColumns, ['id', 'id', 'created_at', 'data.plan']);
  assert.deepEqual(node.data.selectNames, [null, 'company_id', null, null]);
});

test('a column already selected is added again', () => {
  assert.match(actions.addSelectColumn(base(), 'c', 'id'), /s(elect)?: c\.id, c\.id as company_id, c\.created_at => month, c\.data\.plan, c\.id$/);
});

test('the × removes one copy, found by its column and which copy it is', () => {
  assert.equal(actions.occurrenceAt(['id', 'id', 'name'], 1), 1);
  assert.match(actions.removeSelectColumn(base(), 'c', 'id', 1), /: c\.id, c\.created_at => month, c\.data\.plan$/);
  assert.match(actions.removeSelectColumn(base(), 'c', 'id', 0), /: c\.id as company_id, c\.created_at => month/);
  // A copy that isn't there changes nothing.
  assert.equal(actions.removeSelectColumn(base(), 'c', 'id', 5), expression);
});

test('a name is set, replaced or dropped, and keeps the rest of the item', () => {
  assert.match(actions.setSelectName(base(), 'c', 'id', 0, 'pk'), /: c\.id as pk, c\.id as company_id/);
  assert.match(actions.setSelectName(base(), 'c', 'id', 1, 'owner_id'), /: c\.id, c\.id as owner_id,/);
  assert.match(actions.setSelectName(base(), 'c', 'id', 1, ''), /: c\.id, c\.id, c\.created_at/);
  assert.match(actions.setSelectName(base(), 'c', 'created_at', 0, 'm'), /c\.created_at => month as m,/);
  assert.match(actions.setSelectName(base(), 'c', 'data.plan', 0, 'plan'), /c\.data\.plan as plan$/);
});

test('a typed name can only write a plain name', () => {
  assert.equal(actions.selectName(' company id '), 'company_id');
  assert.equal(actions.selectName("x | delete!"), 'x_delete_');
  assert.equal(actions.selectName("a, c.secret as b"), 'a_c_secret_as_b');
  assert.equal(actions.selectName('2nd'), '_2nd');
  assert.equal(actions.selectName('   '), '');
  assert.match(actions.setSelectName(base(), 'c', 'id', 0, "x' or 1=1 --"), /: c\.id as x_or_1_1_, c\.id as company_id/);
});

test('* adds the columns not selected yet, and keeps names and copies', () => {
  const present = new Set(actions.getSelectColumns(base(), 'c'));
  assert.deepEqual([...present], ['id', 'created_at', 'data.plan']);
  assert.match(
    actions.addSelectColumns(base(), 'c', ['id', 'name'].filter(c => !present.has(c))),
    /: c\.id, c\.id as company_id, c\.created_at => month, c\.data\.plan, c\.name$/,
  );
});

test('a JSON path typed without the alias is named too', () => {
  const typed = 'company as c | s: data.company.id';
  const typedAst = {
    ...ast,
    ranges: [
      { alias: 'c', start: { line: 0, character: 0 }, end: { line: 0, character: 12 } },
      { alias: 'c', start: { line: 0, character: 15 }, end: { line: 0, character: typed.length } },
    ],
    columns: [{ alias: 'c', column: 'data', path: ['company', 'id'], 'column-alias': 'data.company.id' }],
  };
  const typedBase = { expression: typed, ast: typedAst, segments: segmentsFromAst(typed, typedAst), aliasMap: new Map() };
  assert.match(actions.setSelectName(typedBase, 'c', 'data.company.id', 0, 'company_id'), /: data\.company\.id as company_id$/);
});
