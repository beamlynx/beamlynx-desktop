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

// run_sql_as_pine's `variables`: SQL's `$1` by number too (beamlynx-plans #32).
const { sqlVariablesSchema } = require('../dist/main/mcp/variables-schema.js');
const sqlOk = v => sqlVariablesSchema.safeParse(v).success;

test("run_sql_as_pine takes a $1-style parameter's number, and names", () => {
  assert.ok(sqlOk({ 1: [17, 23], 12: 'x', company_name: 'Acme' }));
  for (const name of ['1x', 'a-b', '', '-1', '1.5']) assert.ok(!sqlOk({ [name]: 'v' }), name);
  assert.ok(!sqlOk({ 1: 9007199254740993 }));
});

test("run_query still refuses a number as a name", () => {
  assert.ok(!ok({ 1: 'v' }));
});
