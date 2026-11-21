// Variables in the canvas's where editor: a `$name` value, `in` lists, and
// the values-block line a new variable gets.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildWhereLiteral,
  variablesIn,
  whereSegmentText,
} = require('../store/canvas/pine-actions.ts');
const { hasValue, setValue } = require('../store/values-blocks.ts');
const { whereLiteral } = require('../store/client.ts');

test('a $name value is written as a variable, not a string', () => {
  assert.equal(buildWhereLiteral('$status'), '$status');
  assert.equal(buildWhereLiteral('shipped'), "'shipped'");
  assert.equal(
    whereSegmentText([{ alias: 'o', column: 'status', operator: '=', value: '$status' }]),
    'where: o.status = $status',
  );
});

test('in takes a list, written or typed, or a list variable', () => {
  assert.equal(buildWhereLiteral('1, 2', 'in'), '(1, 2)');
  assert.equal(buildWhereLiteral('a, b', 'not in'), "('a', 'b')");
  assert.equal(buildWhereLiteral('(1, 2)', 'in'), '(1, 2)');
  assert.equal(buildWhereLiteral('$ids', 'in'), '$ids');
  assert.equal(
    whereLiteral([
      { type: 'number', value: 1 },
      { type: 'number', value: 2 },
    ]),
    '(1, 2)',
  );
});

test('a new variable gets an empty line in the values block', () => {
  const conditions = [
    { alias: 'o', column: 'status', operator: '=', value: '$status' },
    { alias: 'o', column: 'id', operator: 'in', value: '$ids' },
  ];
  assert.deepEqual(variablesIn(conditions), ['status', 'ids']);
  const tab = "$status = 'x'\n\norders as o";
  assert.equal(hasValue(tab, 'status'), true);
  assert.equal(hasValue(tab, 'ids'), false);
  assert.equal(setValue(tab, 'ids', ''), "$status = 'x'\n$ids = \n\norders as o");
});

test('make variable moves the literal into the values block', () => {
  assert.equal(
    setValue('orders as o', 'status', "'shipped'"),
    "$status = 'shipped'\n\norders as o",
  );
  assert.equal(setValue('orders as o', 'ids', '(1, 2)'), '$ids = (1, 2)\n\norders as o');
});
