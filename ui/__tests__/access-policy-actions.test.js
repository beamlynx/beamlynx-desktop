// What the results grid's right-click menu offers for a column, from what
// pine-lang reported about it (utils/accessPolicy.ts). A hide rule always
// wins, so a column a broader hide rule covers is never offered "Show".
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  columnName,
  columnPolicyAction,
  describeMatcher,
  exactColumnRule,
  findModule,
  sameRules,
} = require('../utils/accessPolicy.ts');

const table = { schema: 'public', table: 'user' };
const agents = { mcpEnabled: true, policyId: 'p1' };

test('a shown column offers Hide', () => {
  const action = columnPolicyAction({ hidden: false, table }, 'email', false, agents);
  assert.deepEqual(action, { kind: 'hide', target: { schema: 'public', table: 'user', column: 'email' }, isPath: false });
});

test('a column hidden for lack of a show rule offers Show', () => {
  assert.equal(columnPolicyAction({ hidden: true, table }, 'email', false, agents).kind, 'show');
});

test('a column hidden by its own exact-column hide rule offers Show', () => {
  const by = { type: 'hide', match: { type: 'column', schema: 'public', table: 'user', column: 'email' } };
  assert.equal(columnPolicyAction({ hidden: true, by, table }, 'email', false, agents).kind, 'show');
});

test('a column hidden by a broader hide rule names the rule instead of offering Show', () => {
  const by = { type: 'hide', match: { type: 'column-name', contains: 'token' } };
  const action = columnPolicyAction({ hidden: true, by, table }, 'reset_token', false, agents);
  assert.equal(action.kind, 'hidden-by-rule');
  assert.deepEqual(action.rule, by);
});

test('nothing to offer for a computed value, or with no report at all', () => {
  assert.equal(columnPolicyAction({ hidden: true }, 'x', false, agents), null);
  assert.equal(columnPolicyAction(undefined, 'email', false, { mcpEnabled: false, policyId: 'p1' }), null);
});

test('a connection agents can query with no policy says so', () => {
  assert.deepEqual(columnPolicyAction(undefined, 'email', false, { mcpEnabled: true, policyId: null }), {
    kind: 'no-policy',
  });
});

test('a key inside a JSON column acts on the whole column', () => {
  const action = columnPolicyAction({ hidden: false, table }, 'data', true, agents);
  assert.equal(action.target.column, 'data');
  assert.equal(action.isPath, true);
});

test('findModule matches the reported rule whatever its key order', () => {
  const stored = { id: 'r1', enabled: true, type: 'hide', match: { type: 'column-name', contains: 'token' } };
  const policy = { id: 'p1', name: 'X', rules: [{ id: 'r0', enabled: true, builtIn: true, type: 'foreign-key' }, stored] };
  assert.equal(findModule(policy, { match: { contains: 'token', type: 'column-name' }, type: 'hide' }), stored);
  assert.equal(findModule(policy, { type: 'hide', match: { type: 'column-name', contains: 'secret' } }), undefined);
});

test('rules and columns in words', () => {
  assert.equal(columnName({ schema: 'public', table: 'user', column: 'email' }), 'user.email');
  assert.equal(columnName({ schema: 'auth', table: 'user', column: 'email' }), 'auth.user.email');
  assert.equal(describeMatcher({ type: 'column-name', contains: 'token' }), 'Name contains “token”');
  assert.equal(describeMatcher({ type: 'column', schema: 'public', table: 'user', column: 'email' }), 'user.email');
  assert.deepEqual(exactColumnRule({ schema: 'public', table: 'user', column: 'email' }, true), {
    type: 'hide',
    match: { type: 'column', schema: 'public', table: 'user', column: 'email' },
  });
});

test('a column rule without a schema says it matches every schema', () => {
  assert.equal(describeMatcher({ type: 'column', schema: null, table: 'user', column: 'email' }), 'user.email in every schema');
  assert.equal(describeMatcher({ type: 'column', table: 'user', column: 'email' }), 'user.email in every schema');
});

test('sameRules compares rule lists whatever order their keys are in', () => {
  const a = [{ id: 'r1', type: 'column', schema: 'public', table: 'user', column: 'email', enabled: true }];
  const b = [{ enabled: true, column: 'email', table: 'user', schema: 'public', type: 'column', id: 'r1' }];
  assert.equal(sameRules(a, b), true);
  assert.equal(sameRules(a, [{ ...b[0], enabled: false }]), false);
  assert.equal(sameRules(a, [...a, { id: 'r2', type: 'foreign-key', enabled: true }]), false);
});
