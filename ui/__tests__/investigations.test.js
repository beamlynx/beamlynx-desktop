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
const { DefaultPlugin } = require('../plugin/default.plugin.tsx');

afterEach(() => {
  delete globalThis.window;
});

/** A fake desktop bridge, recording what the store sends it. */
function stubBridge() {
  const sent = { notes: [], approvals: [], reveals: [], duplicates: [], switched: [], deleted: [] };
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
      accessPolicy: {
        duplicate: async (id, name) => {
          sent.duplicates.push({ id, name });
          return { id: 'pol-copy', name, rules: [] };
        },
        delete: async id => {
          sent.deleted.push(id);
        },
      },
      credentials: {
        setConnectionPolicy: async (id, policyId) => {
          sent.switched.push({ id, policyId });
          return { ok: true, profile: { id, policyId, mcpEnabled: true } };
        },
      },
      mcpReveal: {
        resolve: async (id, outcome) => {
          sent.reveals.push({ id, outcome });
          return null;
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
        const result = await results(session.expression);
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

test('an investigation\'s tab is out of the strip until the robot opens it, at the end', async () => {
  const store = storeWithFakeDatabase(() => ({ rows: [] }));
  const own = store.createSession();
  runInAction(() => (store.activeSessionId = own.id));
  await run(store, 'claude-a', 'user');
  const investigation = store.investigations[0];
  assert.ok(!store.visibleSessionIds.includes(investigation.sessionId), 'not shown on its own');
  assert.equal(store.activeSessionId, own.id, 'never takes focus on its own');

  store.focusAgentTab();
  assert.equal(store.visibleSessionIds.at(-1), investigation.sessionId);
  assert.equal(store.activeSessionId, investigation.sessionId);
});

test('closing an investigation\'s tab only hides it: the agent goes on, and the robot brings it back', async () => {
  const store = storeWithFakeDatabase(() => ({ error: 'hidden', errorType: 'policy', hidden: hiddenType }));
  withPolicy(store);
  const sent = stubBridge();
  await run(store, 'claude-a', 'activity | where: type = \'x\'');
  store.focusAgentTab();
  const investigation = store.investigations[0];
  store.closeTab(investigation.sessionId);
  assert.ok(!store.visibleSessionIds.includes(investigation.sessionId));
  assert.equal(store.investigations.length, 1);
  assert.equal(sent.approvals.length, 0, 'the agent is still waiting for an answer');
  assert.equal(store.agentDecisionsWaiting, 1);
  store.focusAgentTab();
  assert.equal(store.activeSessionId, investigation.sessionId);
  assert.equal(investigation.steps.length, 2);
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

test('overlapping agent runs in one tab are all the agent\'s, never told back as the user\'s', async () => {
  let release;
  const gate = new Promise(resolve => (release = resolve));
  // The first query is held in the database while a second one starts and ends.
  const store = storeWithFakeDatabase(async expression => {
    if (expression === 'user') await gate;
    return { rows: [{ id: 1 }] };
  });
  const sent = stubBridge();
  const first = run(store, 'claude-a', 'user');
  await run(store, 'claude-a', 'tenant');
  release();
  await first;
  assert.deepEqual(store.investigations[0].steps.map(s => s.by), ['agent', 'agent']);
  assert.equal(sent.notes.length, 0);
});

test('a card the agent stopped waiting on can no longer be answered', async () => {
  const store = storeWithFakeDatabase(() => ({ error: 'hidden', errorType: 'policy', hidden: hiddenType }));
  const added = withPolicy(store);
  stubBridge();
  const result = await run(store, 'claude-a', 'activity | where: type = \'x\'');
  store.investigations[0].setApproval(result.approval.id, 'expired');
  assert.equal(await store.answerApproval('claude-a', result.approval.id, true), false);
  assert.equal(added.length, 0);
  assert.equal(store.agentDecisionsWaiting, 0);
});

test('the card says which policy Allow changes, and who else uses it', async () => {
  const store = storeWithFakeDatabase(() => ({ rows: [] }));
  withPolicy(store);
  runInAction(() => {
    store.connections = [...store.connections, { id: 'p2', label: 'Staging', mcpEnabled: true, policyId: 'pol' }];
  });
  await run(store, 'claude-a', 'user');
  assert.deepEqual(store.investigationPolicy('claude-a'), { name: 'Default', others: ['Staging'], connection: 'Prod' });
});

/**
 * A store whose reveal previews run against a fake database: every
 * DefaultPlugin.evaluate answers with `result`, and records its options.
 */
function storeForReveals(result) {
  const store = storeWithFakeDatabase(() => ({ rows: [] }));
  store.ensureProfileConnection = async () => 'conn-1';
  const runs = [];
  const original = DefaultPlugin.prototype.evaluate;
  DefaultPlugin.prototype.evaluate = async function (opts) {
    runs.push(opts);
    const session = this.session;
    runInAction(() => {
      session.rows = result.rows ?? [];
      session.columns = [];
      session.error = result.error ?? '';
      session.evalErrorType = result.errorType ?? '';
    });
    return result.raw ?? [];
  };
  return { store, runs, restore: () => (DefaultPlugin.prototype.evaluate = original) };
}

const revealRequest = {
  id: 'rv-1',
  profileId: 'p1',
  expression: '/* Ada\'s email */\ncustomer | where: id = 1 | s: email',
  reason: 'To match her support ticket',
  createdAt: 0,
  status: 'pending',
  investigationId: 'claude-a',
};

test('a reveal request is a card in its investigation: previewed read-only, then revealed as previewed', async () => {
  const { store, runs, restore } = storeForReveals({ rows: [{ email: 'ada@example.com' }], raw: [['email'], ['ada@example.com']] });
  try {
    const sent = stubBridge();
    const tabsBefore = Object.keys(store.sessions).length;
    await store.handleRevealRequest(revealRequest);
    const investigation = store.investigations.find(i => i.id === 'claude-a');
    const step = investigation.reveal('rv-1');
    assert.equal(step.status, 'pending');
    assert.equal(step.reason, 'To match her support ticket');
    assert.deepEqual(step.preview.rows, [{ email: 'ada@example.com' }]);
    assert.equal(runs[0].allowWrites, false);
    // The preview's session is never a tab: only the investigation's is new.
    assert.equal(Object.keys(store.sessions).length, tabsBefore + 1);
    assert.equal(store.agentDecisionsWaiting, 1);

    assert.equal(await store.answerReveal('claude-a', 'rv-1', true), true);
    assert.equal(sent.reveals.length, 1);
    assert.equal(sent.reveals[0].outcome.ok, true);
    assert.deepEqual(sent.reveals[0].outcome.rows, [['email'], ['ada@example.com']]);
    assert.equal(step.status, 'revealed');
    assert.equal(store.agentDecisionsWaiting, 0);
  } finally {
    restore();
  }
});

test('a reveal request whose query changes data is declined without asking', async () => {
  const { store, restore } = storeForReveals({ error: 'refused', errorType: 'write-refused' });
  try {
    const sent = stubBridge();
    await store.handleRevealRequest({ ...revealRequest, id: 'rv-2', expression: 'customer | delete! .id' });
    const step = store.investigations[0].reveal('rv-2');
    assert.equal(step.status, 'declined');
    assert.match(step.note, /changes data/);
    assert.equal(sent.reveals[0].outcome.ok, false);
  } finally {
    restore();
  }
});

test('declining a reveal sends the user\'s reason', async () => {
  const { store, restore } = storeForReveals({ rows: [{ email: 'x' }] });
  try {
    const sent = stubBridge();
    await store.handleRevealRequest({ ...revealRequest, id: 'rv-3' });
    await store.answerReveal('claude-a', 'rv-3', false, 'Not in production');
    assert.deepEqual(sent.reveals[0].outcome, { ok: false, comment: 'Not in production' });
    assert.equal(store.investigations[0].reveal('rv-3').status, 'declined');
  } finally {
    restore();
  }
});

test('Allow in a copy: the connection gets a copy of its shared policy, and only the copy changes', async () => {
  const store = storeWithFakeDatabase(() => ({ error: 'hidden', errorType: 'policy', hidden: hiddenType }));
  const added = withPolicy(store);
  runInAction(() => {
    store.connections = [...store.connections, { id: 'p2', label: 'Staging', mcpEnabled: true, policyId: 'pol' }];
  });
  const sent = stubBridge();
  const result = await run(store, 'claude-a', 'activity | where: type = \'x\'');
  assert.equal(await store.answerApproval('claude-a', result.approval.id, true, undefined, true), true);
  assert.deepEqual(sent.duplicates, [{ id: 'pol', name: 'Default for Prod' }]);
  assert.deepEqual(sent.switched, [{ id: 'p1', policyId: 'pol-copy' }]);
  assert.equal(store.connections.find(c => c.id === 'p1').policyId, 'pol-copy');
  assert.equal(store.connections.find(c => c.id === 'p2').policyId, 'pol', 'Staging keeps the shared policy');
  assert.equal(added[0].policyId, 'pol-copy', 'the Allow rule goes to the copy');
});

test('undoing a copy puts the connection back on the shared policy and deletes the copy', async () => {
  const store = storeWithFakeDatabase(() => ({ rows: [] }));
  withPolicy(store);
  const sent = stubBridge();
  // Deleting a policy refreshes the connection list from the app; not here.
  store.refreshConnections = async () => store.connections;
  const copy = await store.copyPolicyForConnection('p1');
  assert.equal(copy.id, 'pol-copy');
  await store.undoPolicyCopy('p1', 'pol', 'pol-copy');
  assert.deepEqual(sent.switched.at(-1), { id: 'p1', policyId: 'pol' });
  assert.deepEqual(sent.deleted, ['pol-copy']);
});
