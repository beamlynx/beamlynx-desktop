// Editing a value inside an unnested element from the results grid: the
// element is found by its table's record key and its position in the array.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { elementEditTarget } = require('../store/element-edit.util.ts');

const items = {
  alias: 'i',
  table: 'd_0',
  source: 'd_0',
  column: 'data',
  path: ['items'],
  text: 'data.items',
  index: 1,
};
const parts = {
  alias: 'p',
  table: 'd_0',
  source: 'i',
  column: null,
  path: ['parts'],
  text: 'i.parts',
  index: 2,
};

test('a key of an element becomes a key inside the table column, at the element position', () => {
  assert.deepEqual(elementEditTarget('i', ['qty'], { 7: 1 }, [items], { i: '7' }), {
    alias: 'd_0',
    column: 'data',
    path: ['items', 1, 'qty'],
  });
});

test('the element itself is its position', () => {
  assert.deepEqual(elementEditTarget('i', [], { 7: 0 }, [items], { i: '7' }), {
    alias: 'd_0',
    column: 'data',
    path: ['items', 0],
  });
});

test('elements of elements have a position at each level', () => {
  assert.deepEqual(elementEditTarget('p', [], { 7: 2, 8: 1 }, [items, parts], { i: '7', p: '8' }), {
    alias: 'd_0',
    column: 'data',
    path: ['items', 2, 'parts', 1],
  });
});

test('a value that is not in an element is left to the table rules', () => {
  assert.equal(elementEditTarget('d_0', ['qty'], {}, [items], {}), null);
});

test('without a position, it says why', () => {
  assert.match(elementEditTarget('i', ['qty'], {}, [items], {}), /no position for i/);
  assert.match(
    elementEditTarget('p', [], { 8: 1 }, [items, parts], { p: '8' }),
    /no position for i/,
  );
});
