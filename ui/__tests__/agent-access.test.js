// A connection's Agent access (store/client.ts, GlobalStore.setAgentAccess):
// off, masked by its own policy, or every column with the policy kept.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { runInAction } = require('mobx');
const { agentAccessOf, effectiveAccessPolicyRules, effectiveAccessPolicy } = require('../store/client.ts');
const { GlobalStore } = require('../store/global.store.ts');

afterEach(() => {
  delete globalThis.window;
});

const email = { type: 'column', schema: 'public', table: 'user', column: 'email' };
const policy = { id: 'own', name: 'x', connectionId: 'p1', rules: [{ ...email, id: 'r1', enabled: true }] };

test('a connection reads as off, masked or every column', () => {
  assert.equal(agentAccessOf(undefined), 'off');
  assert.equal(agentAccessOf({ id: 'p1', mcpEnabled: false, policyId: 'own' }), 'off');
  assert.equal(agentAccessOf({ id: 'p1', mcpEnabled: true, policyId: 'own' }), 'masked');
  assert.equal(agentAccessOf({ id: 'p1', mcpEnabled: true, policyId: 'own', agentsSeeEveryColumn: true }), 'every-column');
  // No policy with MCP on: agents already see everything.
  assert.equal(agentAccessOf({ id: 'p1', mcpEnabled: true, policyId: null }), 'every-column');
});

test('every column keeps the policy but applies it to no one, agents or your own queries', () => {
  const masked = { id: 'p1', mcpEnabled: true, policyId: 'own', applyPolicyToOwnQueries: true };
  assert.deepEqual(effectiveAccessPolicyRules(masked, [policy], true), [email]);
  assert.deepEqual(effectiveAccessPolicyRules(masked, [policy], false), [email]);
  const all = { ...masked, agentsSeeEveryColumn: true };
  assert.deepEqual(effectiveAccessPolicyRules(all, [policy], true), []);
  assert.deepEqual(effectiveAccessPolicyRules(all, [policy], false), []);
  // Nor does your own tab annotate columns agents can't see: they see them all.
  assert.deepEqual(effectiveAccessPolicy({ ...all, applyPolicyToOwnQueries: false }, [policy], false), { rules: [], mode: 'enforce' });
});

test('setting agent access updates the connection and reloads its policy', async () => {
  const store = new GlobalStore();
  const calls = [];
  globalThis.window = {
    beamlynxDesktop: {
      credentials: {
        setAgentAccess: async (id, access, templateId) => {
          calls.push([id, access, templateId]);
          return { ok: true, profile: { id, mcpEnabled: access !== 'off', policyId: 'own', agentsSeeEveryColumn: access === 'every-column' } };
        },
      },
      accessPolicy: { list: async () => [policy] },
    },
  };
  runInAction(() => {
    store.connections = [{ id: 'p1', label: 'Prod', mcpEnabled: false, policyId: null }];
  });
  assert.equal(await store.setAgentAccess('p1', 'masked', 'builtin:default'), true);
  assert.equal(agentAccessOf(store.connections[0]), 'masked');
  assert.equal(store.connectionPolicy('p1').id, 'own');
  assert.equal(await store.setAgentAccess('p1', 'every-column'), true);
  assert.equal(agentAccessOf(store.connections[0]), 'every-column');
  assert.deepEqual(calls, [['p1', 'masked', 'builtin:default'], ['p1', 'every-column', undefined]]);
});

test('templates list the built-in Default first, then your own', () => {
  const store = new GlobalStore();
  runInAction(() => {
    store.accessPolicies = [
      { id: 'mine', name: 'Mine', rules: [] },
      { id: 'own', name: 'x', rules: [], connectionId: 'p1' },
      { id: 'builtin:default', name: 'Default', builtIn: true, rules: [] },
    ];
  });
  assert.deepEqual(store.policyTemplates.map(p => p.name), ['Default', 'Mine']);
});

test("copying another database's rules gives this one its own copy, and reloads the policies", async () => {
  const store = new GlobalStore();
  const calls = [];
  const copy = { ...policy, id: 'copy', connectionId: 'p2' };
  globalThis.window = {
    beamlynxDesktop: {
      credentials: {
        copyPolicyFrom: async (id, sourceId) => {
          calls.push([id, sourceId]);
          return { ok: true, profile: { id, mcpEnabled: true, policyId: 'copy' } };
        },
      },
      accessPolicy: { list: async () => [policy, copy] },
    },
  };
  runInAction(() => {
    store.connections = [
      { id: 'p1', label: 'Prod', mcpEnabled: true, policyId: 'own' },
      { id: 'p2', label: 'Staging', mcpEnabled: true, policyId: null },
    ];
  });
  assert.equal(await store.copyPolicyFrom('p2', 'p1'), true);
  assert.deepEqual(calls, [['p2', 'p1']]);
  assert.equal(store.connectionPolicy('p2').id, 'copy');
  assert.equal(store.connectionPolicy('p1').id, 'own');
});

test("copying another database's rules says so on an app that can't", async () => {
  const store = new GlobalStore();
  globalThis.window = { beamlynxDesktop: { credentials: {}, accessPolicy: { list: async () => [] } } };
  assert.equal(await store.copyPolicyFrom('p2', 'p1'), false);
  assert.match(store.connectionError, /can't copy another database's rules/);
});

test('opening a database on the Agent page opens that page, at that database and rule', () => {
  const store = new GlobalStore();
  store.openAgentDatabase('p1', 'r1');
  assert.equal(store.showSettings, true);
  assert.equal(store.settingsSection, 'mcp');
  assert.deepEqual(store.agentDatabaseFocus, { connectionId: 'p1', ruleId: 'r1' });
  store.clearAgentDatabaseFocus();
  assert.equal(store.agentDatabaseFocus, null);
});
