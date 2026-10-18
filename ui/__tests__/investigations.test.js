// Agent investigations (store/investigations.ts and GlobalStore): one tab per
// Claude session, a timeline that keeps what the agent saw, approvals that
// the agent's call waits on, and the user's own runs told to the agent.
// Runs a real GlobalStore; only the database round trip and the desktop
// bridge are faked.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { runInAction } = require('mobx');
const { GlobalStore } = require('../store/global.store.ts');
const { Investigation, queryReason } = require('../store/investigations.ts');
const { McpWriteRefusalMinVersion } = require('../constants.ts');

afterEach(() => {
  delete globalThis.window;
});

/** A fake desktop bridge, recording what the store sends it. */
function stubBridge() {
  const sent = { notes: [], approvals: [] };
  globalThis.window = {
    beamlynxDesktop: {
      mcp: {
        addNote: async (investigationId, text) => {
          sent.notes.push({ investigationId, text });
          return { id: `note-${sent.notes.length}`, text, at: Date.now() };
        },
        resolveApproval: async (id, outcome) => {
          sent.approvals.push({ id, outcome });
          return true;
        },
      },
    },
  };
  return sent;
}

/**
 * A GlobalStore whose agent queries run in real investigation tabs, with
 * each tab's database result decided by `results(expression)`.
 */
function storeWithFakeDatabase(results) {
  const store = new GlobalStore();
  store.mcpQueryDeps = investigationId => ({
    client: { createConnection: async () => 'conn-1', build: async () => ({}) },
    getSavedProfileCredentials: async () => ({ dbHost: 'h', dbPort: '1', dbName: 'd', dbUser: 'u', dbPassword: 'p' }),
    getOrCreateMcpSession: () => {
      const session = store.getOrCreateMcpSession(investigationId);
      session.plugins.default.evaluate = async () => {
        const result = results(session.expression);
        runInAction(() => {
          session.expressionAtLastEval = session.expression;
          session.rows = result.rows ?? [];
          session.columns = [];
          session.error = result.error ?? '';
          session.evalErrorType = result.errorType ?? '';
          session.evalHiddenColumn = result.hidden ?? null;
        });
        return result.rows ?? [];
      };
      return session;
    },
    getMcpConnectionId: () => 'conn-1',
    setMcpConnectionId: () => {},
    resolveAccessPolicyRules: async () => [{ type: 'foreign-key' }],
    getServerVersion: () => McpWriteRefusalMinVersion,
  });
  return store;
}

const run = (store, investigationId, expression) =>
  store.runMcpQuery({ profileId: 'p1', expression, investigationId });

test('each Claude session gets its own tab, and neither is one of the user\'s own', async () => {
  const store = storeWithFakeDatabase(() => ({ rows: [{ id: 1 }] }));
  await run(store, 'claude-a', 'user');
  await run(store, 'claude-b', 'tenant');
  const [a, b] = store.investigations;
  assert.notEqual(a.sessionId, b.sessionId);
  assert.deepEqual(store.agentSessionIds.sort(), [a.sessionId, b.sessionId].sort());
  assert.ok(!store.visibleSessionIds.includes(a.sessionId));
  assert.ok(store.sessions[a.sessionId].isMcpSession && store.sessions[b.sessionId].isMcpSession);
  assert.deepEqual(a.steps.map(s => s.expression), ['user']);
  assert.deepEqual(b.steps.map(s => s.expression), ['tenant']);
  // The robot opens the one whose agent called last.
  b.lastCallAt = 2;
  a.lastCallAt = 1;
  assert.equal(store.mcpSessionId, b.sessionId);
});

test('every query keeps what the agent saw, and an older one shows again without running', async () => {
  let runs = 0;
  const store = storeWithFakeDatabase(expression => {
    runs++;
    return expression.includes('fail') ? { error: 'timed out' } : { rows: [{ q: expression }] };
  });
  await run(store, 'claude-a', '/* Who signed up */\nuser');
  await run(store, 'claude-a', 'activity | fail');
  const investigation = store.investigations[0];
  const [first, second] = investigation.steps;
  assert.equal(first.reason, 'Who signed up');
  assert.equal(first.rowCount, 1);
  assert.equal(second.error, 'timed out');

  store.showInvestigationStep('claude-a', first.id);
  const session = store.sessions[investigation.sessionId];
  assert.deepEqual(session.rows, [{ q: '/* Who signed up */\nuser' }]);
  assert.equal(session.error, '');
  assert.equal(runs, 2, 'showing a step must not run it');
  assert.equal(investigation.selectedStepId, first.id);

  // The agent's next query is followed again.
  await run(store, 'claude-a', 'tenant');
  assert.equal(investigation.selectedStepId, null);
});

const hiddenType = {
  alias: 'a_0',
  column: 'type',
  hidden: true,
  table: { schema: 'public', table: 'activity' },
};

function withPolicy(store) {
  runInAction(() => {
    store.connections = [{ id: 'p1', label: 'Prod', mcpEnabled: true, policyId: 'pol' }];
    store.accessPolicies = [{ id: 'pol', name: 'Default', rules: [] }];
  });
  const added = [];
  store.addAccessPolicyRule = async (policyId, rule) => {
    added.push({ policyId, rule });
    return { id: policyId, name: 'Default', rules: [] };
  };
  return added;
}

test('a query refused for a hidden column asks the user, and Allow writes an Allow rule', async () => {
  const store = storeWithFakeDatabase(() => ({ error: 'hidden', errorType: 'policy', hidden: hiddenType }));
  const added = withPolicy(store);
  const sent = stubBridge();

  const result = await run(store, 'claude-a', '/* Which rows are logins */\nactivity | where: type = \'x\'');
  assert.ok(result.approval?.id, 'the agent\'s call is told to wait');
  assert.equal(result.approval.column, 'type');
  const investigation = store.investigations[0];
  assert.equal(investigation.pendingApprovals.length, 1);
  assert.equal(investigation.pendingApprovals[0].reason, 'Which rows are logins');
  assert.equal(store.agentDecisionsWaiting, 1);

  assert.equal(await store.answerApproval('claude-a', result.approval.id, true), true);
  assert.deepEqual(added, [
    { policyId: 'pol', rule: { type: 'column', schema: 'public', table: 'activity', column: 'type' } },
  ]);
  assert.deepEqual(sent.approvals, [{ id: result.approval.id, outcome: { allowed: true, comment: undefined } }]);
  assert.equal(investigation.pendingApprovals.length, 0);
});

test('a column an Except rule hides is not offered: the Except rule would win anyway', async () => {
  const byExcept = { ...hiddenType, by: { type: 'hide', match: { type: 'column-name', contains: 'type' } } };
  const store = storeWithFakeDatabase(() => ({ error: 'hidden', errorType: 'policy', hidden: byExcept }));
  withPolicy(store);
  stubBridge();
  const result = await run(store, 'claude-a', 'activity | where: type = \'x\'');
  assert.equal(result.approval, undefined);
  assert.equal(store.investigations[0].pendingApprovals.length, 0);
});

test('without a desktop app that can wait, nothing is asked', async () => {
  const store = storeWithFakeDatabase(() => ({ error: 'hidden', errorType: 'policy', hidden: hiddenType }));
  withPolicy(store);
  const result = await run(store, 'claude-a', 'activity | where: type = \'x\'');
  assert.equal(result.approval, undefined);
});

test('the user running a query in the agent\'s tab goes in the timeline and is told to the agent', async () => {
  const store = storeWithFakeDatabase(() => ({ rows: [{ id: 1 }, { id: 2 }] }));
  await run(store, 'claude-a', 'user');
  const sent = stubBridge();
  const investigation = store.investigations[0];
  const session = store.sessions[investigation.sessionId];
  runInAction(() => {
    session.expression = 'user | where: id = 2';
  });
  await session.evaluate();
  const last = investigation.steps.at(-1);
  assert.equal(last.by, 'user');
  assert.equal(sent.notes.length, 1);
  assert.equal(sent.notes[0].investigationId, 'claude-a');
  assert.match(sent.notes[0].text, /user \| where: id = 2/);
  assert.match(sent.notes[0].text, /2 rows/);
});

test('a note is shown as waiting, then as received', async () => {
  const store = storeWithFakeDatabase(() => ({ rows: [] }));
  store.getOrCreateInvestigation('claude-a');
  stubBridge();
  assert.equal(await store.sendInvestigationNote('claude-a', 'logins are auth.login'), true);
  const note = store.investigations[0].steps.at(-1);
  assert.equal(note.delivered, false);
  store.markNotesDelivered('claude-a', [note.id]);
  assert.equal(note.delivered, true);
});

test('closing an investigation\'s tab declines what its agent is waiting on', async () => {
  const store = storeWithFakeDatabase(() => ({ error: 'hidden', errorType: 'policy', hidden: hiddenType }));
  withPolicy(store);
  const sent = stubBridge();
  const result = await run(store, 'claude-a', 'activity | where: type = \'x\'');
  store.closeTab(store.investigations[0].sessionId);
  assert.equal(store.investigations.length, 0);
  assert.deepEqual(sent.approvals.map(a => [a.id, a.outcome.allowed]), [[result.approval.id, false]]);
});

test('the activity feed fills the timeline: question, findings and calls, but not queries twice', () => {
  const investigation = new Investigation('claude-a', 's1');
  const at = 1000;
  investigation.apply({ id: '1', tool: 'set_question', phase: 'start', at, summary: '', detail: 'Logins per tenant' });
  investigation.apply({ id: '2', tool: 'find_tables', phase: 'start', at, summary: 'Searching for tables like "login"' });
  investigation.apply({ id: '2', tool: 'find_tables', phase: 'end', at: at + 5, summary: '', ok: true });
  investigation.apply({ id: '3', tool: 'run_query', phase: 'start', at, summary: 'Running a query' });
  investigation.apply({ id: '4', tool: 'note_finding', phase: 'start', at, summary: '', detail: 'Only activity records logins' });
  assert.equal(investigation.question, 'Logins per tenant');
  assert.deepEqual(
    investigation.steps.map(s => s.kind),
    ['call', 'finding'],
  );
  assert.equal(investigation.steps[0].endedAt, at + 5);
  assert.equal(investigation.lastCallAt, at + 5);
});

test('a query\'s reason is its leading comment', () => {
  assert.equal(queryReason('/* Logins\n   per tenant */\nactivity'), 'Logins per tenant');
  assert.equal(queryReason('-- Why\nactivity'), 'Why');
  assert.equal(queryReason('activity'), undefined);
});
