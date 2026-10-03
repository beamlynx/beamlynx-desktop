// Tests for the text side of recipes (utils/recipes.ts): which blocks Ctrl+S
// saves, which values can become variables, and filling them back in.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { draftFromTab, findLiterals, applyVariables, fillRecipe, mask } = require('../utils/recipes.ts');

const raws = expr => findLiterals(expr).map(l => l.raw);

test('values in where: conditions are found, with a suggested name', () => {
  const expr = "company\n | where: name = 'Acme'\n | tenant .company_id\n | request .tenant_id\n | where: status = 'failed'";
  const lits = findLiterals(expr);
  assert.deepEqual(lits.map(l => l.raw), ["'Acme'", "'failed'"]);
  assert.deepEqual(lits.map(l => l.table), ['company', 'request']);
  assert.deepEqual(lits.map(l => l.suggestedName), ['company_name', 'status']);
  assert.equal(expr.slice(lits[0].start, lits[0].end), "'Acme'");
});

test('a condition without where:, a cast after the value, and camelCase columns', () => {
  const expr = "requests.request | readable_id = '4711' ::text | public.tenant .tenant_id :parent | where: deletedAt > '2026-01-01'";
  const lits = findLiterals(expr);
  assert.deepEqual(lits.map(l => l.raw), ["'4711'", "'2026-01-01'"]);
  assert.deepEqual(lits.map(l => [l.table, l.column]), [['request', 'readable_id'], ['tenant', 'deletedAt']]);
});

test('every Pine operator, numbers, alias-qualified columns and in lists', () => {
  const expr = "user as u | where: u.age > 30 | where: u.email ilike '%@acme.com' | where: u.role != 'guest' | where: u.state in ('SE', 'NO')";
  assert.deepEqual(raws(expr), ['30', "'%@acme.com'", "'guest'", "'SE'", "'NO'"]);
  assert.equal(findLiterals(expr)[0].kind, 'number');
  assert.equal(findLiterals(expr)[0].column, 'age');
  assert.deepEqual(raws("t | where: a not like 'x%' | where: b is not null | where: c < 5"), ["'x%'", '5']);
});

test('values inside comments or strings are not offered', () => {
  const expr = "-- where: name = 'old'\ncompany /* status = 'x' */ | where: note = 'a = 5'";
  assert.deepEqual(raws(expr), ["'a = 5'"]);
  assert.equal(mask("a = 'b' -- c").length, "a = 'b' -- c".length);
});

test('update! values can become variables too', () => {
  assert.deepEqual(raws("user | where: id = 7 | update! role = 'admin'"), ['7', "'admin'"]);
});

test('chosen values become $variables with their example, others stay fixed', () => {
  const expr = "company | where: name = 'Acme' | request .tenant_id | where: status = 'failed' | limit: 10";
  const lits = findLiterals(expr);
  const { expression, inputs } = applyVariables(expr, lits, { 0: 'company_name' });
  assert.equal(expression, "company | where: name = $company_name | request .tenant_id | where: status = 'failed' | limit: 10");
  assert.deepEqual(inputs, [{ name: 'company_name', example: 'Acme', kind: 'string', column: 'company.name' }]);
});

test('variable names are made safe and unique; the same value twice under one name is one variable', () => {
  const expr = "t | where: a = 'x' | where: b = 'y' | where: c = 'x'";
  const lits = findLiterals(expr);
  const out = applyVariables(expr, lits, { 0: 'my name', 1: 'my name', 2: 'my name' });
  assert.equal(out.expression, "t | where: a = $my_name | where: b = $my_name_2 | where: c = $my_name");
  assert.deepEqual(out.inputs.map(i => [i.name, i.example]), [['my_name', 'x'], ['my_name_2', 'y']]);
  assert.equal(applyVariables('t | where: n = 3', findLiterals('t | where: n = 3'), { 0: '9lives' }).inputs[0].name, 'v_9lives');
});

test('filling a recipe puts the examples back and points at the first value', () => {
  const { text, firstValue } = fillRecipe('company | where: name = $company_name | where: age > $min_age', [
    { name: 'company_name', example: 'Acme', kind: 'string' },
    { name: 'min_age', example: '30', kind: 'number' },
  ]);
  assert.equal(text, "company | where: name = 'Acme' | where: age > 30");
  assert.equal(text.slice(firstValue.from, firstValue.to), 'Acme');
  assert.deepEqual(fillRecipe('company', []), { text: 'company', firstValue: null });
});

test('Ctrl+S takes the block under the cursor, and its doc comment becomes the title and explanation', () => {
  const tab = "user | limit: 5\n\n-- Failed requests for a company.\n-- Requests belong to tenants.\ncompany | where: name = 'Acme'";
  const d = draftFromTab(tab, 4);
  assert.equal(d.expression, "company | where: name = 'Acme'");
  assert.equal(d.title, 'Failed requests for a company');
  assert.equal(d.explanation, 'Requests belong to tenants.');
  assert.deepEqual(d.includedNames, []);
  assert.equal(draftFromTab(tab, 0).expression, 'user | limit: 5');
  assert.equal(draftFromTab('/* Admins. */\nuser', 0).title, 'Admins');
  assert.equal(draftFromTab('   ', 0), null);
});

test('a block that uses a named result from a block above brings that block along', () => {
  const tab = "company | where: active = true |= active_companies\n\nuser | limit: 3\n\nactive_companies\n | user .company_id\n | where: role = 'admin'";
  const d = draftFromTab(tab, 5);
  assert.equal(d.expression, "company | where: active = true |= active_companies\n\nactive_companies\n | user .company_id\n | where: role = 'admin'");
  assert.deepEqual(d.includedNames, ['active_companies']);
});
