// Tests for the text side of recipes (utils/recipes.ts): which blocks Ctrl+S
// saves, which values can become variables, and filling them back in.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { draftFromTab, findLiterals, applyVariables, mask } = require('../utils/recipes.ts');

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

test('Ctrl+S takes the block under the cursor, keeps its comments, and offers a title', () => {
  const tab = "user | limit: 5\n\n-- Failed requests for a company.\n-- Requests belong to tenants.\ncompany | where: name = 'Acme'";
  const d = draftFromTab(tab, 4);
  assert.equal(d.expression, "-- Failed requests for a company.\n-- Requests belong to tenants.\ncompany | where: name = 'Acme'");
  assert.equal(d.title, 'Failed requests for a company');
  assert.deepEqual(d.includedNames, []);
  assert.equal(draftFromTab(tab, 0).expression, 'user | limit: 5');
  assert.equal(draftFromTab(tab, 0).title, 'user | limit: 5');
  assert.equal(draftFromTab('/* Admins. */\nuser', 0).title, 'Admins');
  assert.equal(draftFromTab('x'.repeat(100), 0).title.length, 80);
  assert.equal(draftFromTab('   ', 0), null);
});

test('a block that uses a named result from a block above brings that block along', () => {
  const tab = "company | where: active = true |= active_companies\n\nuser | limit: 3\n\nactive_companies\n | user .company_id\n | where: role = 'admin'";
  const d = draftFromTab(tab, 5);
  assert.equal(d.expression, "company | where: active = true |= active_companies\n\nactive_companies\n | user .company_id\n | where: role = 'admin'");
  assert.deepEqual(d.includedNames, ['active_companies']);
});

test('a recipe summary is the first line of its explanation, or of its top comment', () => {
  const { recipeSummary } = require('../utils/recipes.ts');
  assert.equal(recipeSummary({ expression: '-- Requests belong to tenants.\n-- More.\ncompany', explanation: '' }), 'Requests belong to tenants.');
  assert.equal(recipeSummary({ expression: '/* Admins. */\nuser', explanation: '' }), 'Admins.');
  assert.equal(recipeSummary({ expression: 'user', explanation: 'From an agent.\nSecond line.' }), 'From an agent.');
  assert.equal(recipeSummary({ expression: 'user', explanation: '' }), '');
});

test('Ctrl+S brings along the values blocks for the variables the query uses', () => {
  const { draftFromTab } = require('../utils/recipes.ts');
  const tab = "$company = 'Acme'\n$unused = 1\n\n$status = 'failed'\n\nrequest | where: status = $status";
  const d = draftFromTab(tab, 5);
  assert.equal(d.expression, "$status = 'failed'\n\nrequest | where: status = $status");
  assert.deepEqual(d.includedNames, ['$status']);
  // The cursor in a values block saves the query below it.
  assert.equal(draftFromTab(tab, 0).expression, d.expression);
  assert.equal(draftFromTab("$a = 1", 0), null);
});

test('an old recipe with inputs goes in with a values block above it', () => {
  const { recipeText } = require('../utils/recipes.ts');
  assert.equal(
    recipeText({ expression: 'company | where: name = $n | where: id = $id', inputs: [{ name: 'n', example: 'Acme', kind: 'string' }, { name: 'id', example: '7', kind: 'number' }] }),
    "$n = 'Acme'\n$id = 7\n\ncompany | where: name = $n | where: id = $id",
  );
  assert.equal(recipeText({ expression: 'company', inputs: [] }), 'company');
});

test('values-blocks: split, write a literal, and set a value in the text', () => {
  const { splitQuery, literalFor, setValue, isValuesBlock } = require('../store/values-blocks.ts');
  assert.ok(isValuesBlock("-- note\n$a = 1"));
  assert.ok(!isValuesBlock('company'));
  assert.deepEqual(splitQuery("$a = 1\n\ncompany | where: id = $a"), { prefix: '$a = 1\n\n', query: 'company | where: id = $a' });
  assert.deepEqual(splitQuery('company'), { prefix: '', query: 'company' });
  assert.equal(splitQuery('company\n\n$a = 1'), null, 'a values block after the query');
  assert.equal(splitQuery('company\n\nuser'), null, 'two query blocks');
  assert.equal(literalFor('Acme', false), "'Acme'");
  assert.equal(literalFor('42', false), '42');
  assert.equal(literalFor('a, 7', true), "('a', 7)");
  assert.throws(() => literalFor("O'Brien", false), /single quote/);
  assert.equal(setValue("$a = 1\n\ncompany", 'a', '2'), "$a = 2\n\ncompany");
  assert.equal(setValue("$a = 1\n\ncompany | where: x = $b", 'b', "'x'"), "$a = 1\n$b = 'x'\n\ncompany | where: x = $b");
  assert.equal(setValue('company | where: x = $b', 'b', "'x'"), "$b = 'x'\n\ncompany | where: x = $b");
});

const { textToInsert } = require('../utils/recipes.ts');

test("inserting a recipe keeps the tab's value for a $name the tab already sets", () => {
  const tab = "$x = 'Acme'\n\ncompany | where: name = $x";
  const recipe = "$x = 'Globex'\n$y = 5\n\nemployee | where: id = $y";
  assert.equal(textToInsert(tab, recipe), "$y = 5\n\nemployee | where: id = $y");
});

test('inserting the same recipe twice adds no second copy of its values', () => {
  const recipe = "-- the company\n$x = 'Acme'\n\ncompany | where: name = $x";
  const once = recipe;
  assert.equal(textToInsert(once, recipe), 'company | where: name = $x');
});

test('a tab without values gets the recipe as it is', () => {
  const recipe = "$x = 'Acme'\n\ncompany | where: name = $x";
  assert.equal(textToInsert('user | count:', recipe), recipe);
});
