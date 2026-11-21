// A column picker's filter can name tables first: `t.id`, `tenant id`.
// See store/canvas/picker-filter.ts.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { filterGroups } = require('../store/canvas/picker-filter');

const group = (table, alias, columns) => ({
  label: `${table} (${alias})`,
  alias,
  table,
  items: columns.map(c => ({ id: `${alias}.${c}`, label: c, value: c, alias })),
});

// Two tenant tables in one query, and a table with a tenant_id.
const groups = [
  group('user', 'u', ['id', 'email', 'tenant_id', 'data']),
  group('tenant', 't', ['id', 'name']),
  group('tenant', 't2', ['id', 'name']),
];
const shown = filter => filterGroups(groups, filter).flatMap(items => items.map(i => i.id));

test('alias.column lists that table only', () => {
  assert.deepEqual(shown('t.id'), ['t.id']);
  assert.deepEqual(shown('t2.'), ['t2.id', 't2.name']);
  assert.deepEqual(shown('U.em'), ['u.email']);
});

test('a table name and a column list every table by that name', () => {
  assert.deepEqual(shown('tenant id'), ['t.id', 't2.id']);
  assert.deepEqual(shown('ten na'), ['t.name', 't2.name']);
  // The column part is fuzzy, as always: `id` is in tenant_id too.
  assert.deepEqual(shown('u id'), ['u.id', 'u.tenant_id']);
});

test('the table can come last', () => {
  assert.deepEqual(shown('id tenant'), ['t.id', 't2.id']);
  assert.deepEqual(shown('na t2'), ['t2.name']);
  // A first word that names a table wins: `u`'s columns matching `t`.
  assert.deepEqual(shown('u t'), ['u.tenant_id', 'u.data']);
});

test('without a table named, the filter is as before', () => {
  assert.deepEqual(shown('email'), ['u.email']);
  // A key inside a JSON column: `data` is no table here.
  assert.deepEqual(shown('data.city'), []);
  // Spaces are ignored when the first word is no table.
  assert.deepEqual(shown('ema il'), ['u.email']);
});

test('a named table without a match falls back to the filter as typed', () => {
  assert.deepEqual(shown('user nope'), []);
  const withTenantId = [group('user', 'u', ['tenant_id']), group('tenant', 't', ['name'])];
  const ids = filterGroups(withTenantId, 'tenant id').flatMap(items => items.map(i => i.id));
  assert.deepEqual(ids, ['u.tenant_id']);
});

test('groups that are not a table filter as typed', () => {
  const typed = { label: 'nested', items: [{ id: 'typed:t.x', label: 't.x', value: 't.x' }] };
  const result = filterGroups([typed, ...groups], 't.x');
  assert.deepEqual(result[0].map(i => i.id), ['typed:t.x']);
});
