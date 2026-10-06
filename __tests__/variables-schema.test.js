// The `variables` argument of run_query (src/main/mcp/variables-schema.ts),
// loaded from the build `npm test` runs first.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { variablesSchema } = require('../dist/main/mcp/variables-schema.js');

const ok = v => variablesSchema.safeParse(v).success;

test('accepts strings, numbers, booleans and lists of them', () => {
  assert.ok(ok({ company_name: 'Acme', n: 3, flag: true, ids: [17, 23], _x1: 'a' }));
});

test('refuses an integer that JSON has already rounded', () => {
  assert.ok(!ok({ id: 9007199254740993 }));
  assert.ok(!ok({ ids: [1, 12345678901234567] }));
  assert.ok(ok({ id: '9007199254740993' }));
  assert.ok(ok({ price: 12.5 }));
});

test('refuses names that are not a $name', () => {
  for (const name of ['a/x', '1x', 'a-b', '', 'a b']) assert.ok(!ok({ [name]: 'v' }), name);
});

test('refuses nested values and null', () => {
  assert.ok(!ok({ x: { value: 1 } }));
  assert.ok(!ok({ x: [[1]] }));
  assert.ok(!ok({ x: null }));
});

test('refuses more than 50 variables', () => {
  const many = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`v${i}`, i]));
  assert.ok(!ok(many));
});
