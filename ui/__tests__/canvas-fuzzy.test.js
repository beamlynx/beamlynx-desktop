const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fuzzyScore, fuzzyFilter } = require('../store/canvas/fuzzy.ts');

const id = x => x;

test('exact beats prefix beats substring beats subsequence', () => {
  const s = q => t => fuzzyScore(q, t);
  const exact = fuzzyScore('user', 'user');
  const prefix = fuzzyScore('user', 'username');
  const sub = fuzzyScore('user', 'app_user');
  const loose = fuzzyScore('user', 'u_s_e_r');
  assert.ok(exact > prefix && prefix > sub && sub > loose);
  assert.ok(s);
});

test('subsequence matches', () => {
  assert.deepEqual(fuzzyFilter(['id', 'username', 'email'], 'usrnm', id), ['username']);
  assert.deepEqual(fuzzyFilter(['users', 'order_items'], 'ordr itm', id), ['order_items']);
});

test('no match returns empty', () => {
  assert.deepEqual(fuzzyFilter(['id', 'name'], 'zzz', id), []);
  assert.equal(fuzzyScore('xyz', 'abc'), null);
});

test('empty query keeps all items in order', () => {
  const items = ['b', 'a', 'c'];
  assert.deepEqual(fuzzyFilter(items, '', id), items);
  assert.deepEqual(fuzzyFilter(items, '  ', id), items);
});

test('ranks better matches first, ties keep order', () => {
  assert.deepEqual(fuzzyFilter(['my_user_id', 'username', 'user'], 'user', id), ['user', 'username', 'my_user_id']);
  assert.deepEqual(fuzzyFilter(['ab1', 'ab2'], 'ab', id), ['ab1', 'ab2']);
});
