// Regression tests for values blocks (`$name = value` lines) as text: which
// blocks are values blocks, and rewriting a value from the canvas or after
// an agent's run (store/blocks.ts, store/values-blocks.ts).
//
// Run with: node -r tsx/cjs --test __tests__/*.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isValuesBlock, splitExpressions } = require('../store/blocks.ts');
const { setValue, literalFor, restoreValues, splitQuery } = require('../store/values-blocks.ts');
const { draftFromTab, recipeSummary } = require('../utils/recipes.ts');

test('isValuesBlock: a $ inside a leading comment is not a value', () => {
  assert.equal(isValuesBlock('-- Prices are in US$\nproduct | where: price > 10'), false);
  assert.equal(isValuesBlock('/* doc */\nuser | where: id = /* fixed */ $id'), false);
  assert.equal(isValuesBlock('-- the company\n$x = 1'), true);
  assert.equal(splitQuery('-- Revenue in $ per customer\ncustomer').query, '-- Revenue in $ per customer\ncustomer');
});

test('splitExpressions: /* inside a string or after -- opens no comment', () => {
  assert.equal(splitExpressions("$m = 'image/*'\n\nfile | where: mime = $m").length, 2);
  assert.equal(splitExpressions('-- see /* here\n$m = 1\n\nfile').length, 2);
});

test('setValue: a $ in the value is written as is', () => {
  assert.equal(setValue('$price = 1\n\nproduct', 'price', "'$100'"), "$price = '$100'\n\nproduct");
  assert.equal(setValue('$price = 1\n\nproduct', 'price', "'a$&b'"), "$price = 'a$&b'\n\nproduct");
});

test('setValue: an empty value is filled on its own line, the query kept', () => {
  assert.equal(setValue('$x =\n\nuser | where: id = $x', 'x', '5'), '$x = 5\n\nuser | where: id = $x');
});

test('setValue: rewrites only the value, the last assignment, in values blocks', () => {
  assert.equal(setValue('$x = (1,\n  2)\n\nuser', 'x', '(3, 4)'), '$x = (3, 4)\n\nuser');
  assert.equal(setValue('$x = 1\n\n$x = 2\n\nuser', 'x', '5'), '$x = 1\n\n$x = 5\n\nuser');
  assert.equal(setValue('$x = 1 -- the id\n\nuser', 'x', '5'), '$x = 5 -- the id\n\nuser');
  assert.equal(setValue('$x = 1 /* the\nid */\n\nuser', 'x', '5'), '$x = 5 /* the\nid */\n\nuser');
  assert.equal(
    setValue("$a = 1\n\nuser | where: name = '$x = 1'", 'x', '2'),
    "$a = 1\n$x = 2\n\nuser | where: name = '$x = 1'",
  );
});

test('literalFor: a string value stays a string', () => {
  assert.equal(literalFor('007', false), '007');
  assert.equal(literalFor('007', false, { string: true }), "'007'");
  assert.equal(literalFor('true', false, { string: true }), "'true'");
  assert.equal(literalFor('1, 2', true, { string: true }), "('1', '2')");
});

test('restoreValues: an agent run keeps its values in the tab', () => {
  assert.equal(
    restoreValues('company | where: name = $n', "$n = 'Old'\n\ncompany | where: name = $n", { n: 'Acme' }),
    "$n = 'Acme'\n\ncompany | where: name = $n",
  );
  assert.equal(
    restoreValues('user | where: id in $ids', 'user | where: id in $ids', { ids: [1, 2] }),
    '$ids = (1, 2)\n\nuser | where: id in $ids',
  );
  assert.equal(restoreValues('user', 'user', { n: "O'Brien" }), 'user');
});

test('recipes: values saved above the query; the summary is the query comment', () => {
  const draft = draftFromTab("company | where: name = $x\n\n$x = 'Acme'", 0);
  assert.equal(draft.expression, "$x = 'Acme'\n\ncompany | where: name = $x");
  assert.equal(draftFromTab('$x = 1\n\n-- uses $x later\nuser', 2).expression, '-- uses $x later\nuser');
  assert.equal(recipeSummary({ expression: "$x = 'Acme'\n\n/* Find a company */\ncompany | where: name = $x" }), 'Find a company');
});
