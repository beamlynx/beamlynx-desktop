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
  const sent = { notes: [], proposals: [], reveals: [] };
  globalThis.window = {
    beamlynxDesktop: {
      mcp: {
        addNote: async (investigationId, text) => {
          sent.notes.push({ investigationId, text });
          return { id: `note-${sent.notes.length}`, text, at: Date.now() };
        },
        resolvePolicyProposal: async (id, outcome) => {
          sent.proposals.push({ id, outcome });
          return true;
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

test('an agent\'s SQL never shows in the tab as Pine, converted or not', async () => {
  const store = storeWithFakeDatabase(() => ({ rows: [{ id: 1 }] }));
  const sqlToPine = async sql =>
    sql.includes('OFFSET') ? { error: "Line 1: OFFSET isn't in Pine." } : { expression: 'user | limit: 1' };
  const deps = store.mcpQueryDeps;
  store.mcpQueryDeps = id => ({ ...deps(id), client: { ...deps(id).client, sqlToPine } });
  const runSql = sql => store.runMcpQuery({ profileId: 'p1', expression: '', sql, investigationId: 'claude-a' });

  await runSql('/* One user */ SELECT * FROM "user" LIMIT 1');
  await runSql('SELECT * FROM "user" OFFSET 5');
  const investigation = store.investigations[0];
  const session = store.sessions[investigation.sessionId];
  const [converted, refused] = investigation.steps;

  assert.ok(converted.expression.includes('user | limit: 1'));
  assert.equal(converted.reason, 'One user');
  assert.equal(refused.expression, '', 'SQL that did not convert has no Pine');
  assert.equal(refused.sql, 'SELECT * FROM "user" OFFSET 5');
  assert.match(refused.error, /OFFSET isn't in Pine/);
  assert.equal(refused.snapshot, undefined, 'nothing ran, so there is nothing to show again');

  // Showing either step, or the latest, never puts SQL in the Pine editor.
  store.showInvestigationStep('claude-a', refused.id);
  store.showInvestigationStep('claude-a', null);
  store.showInvestigationStep('claude-a', converted.id);
  assert.ok(!/SELECT/.test(session.expression), session.expression);
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
    store.accessPolicies = [
      {
        id: 'pol',
        name: 'Default for Prod',
        connectionId: 'p1',
        rules: [
          { id: 'h1', type: 'hide', match: { type: 'column-name', contains: 'token' }, enabled: true },
          { id: 'fk', type: 'foreign-key', enabled: true, builtIn: true },
        ],
      },
    ];
  });
  const calls = [];
  const ok = policyId => ({ id: policyId, name: 'Default for Prod', rules: [] });
  store.addAccessPolicyRule = async (policyId, rule) => (calls.push(['add', policyId, rule]), ok(policyId));
  store.removeAccessPolicyRule = async (policyId, id) => (calls.push(['remove', policyId, id]), ok(policyId));
  store.setAccessPolicyRuleEnabled = async (policyId, id, on) => (calls.push(['enabled', policyId, id, on]), ok(policyId));
  store.setAccessPolicyRules = async (policyId, rules) => (calls.push(['set', policyId, rules.map(r => r.id)]), ok(policyId));
  return calls;
}

const proposal = (changes, extra = {}) => ({
  id: 'pp-1',
  investigationId: 'claude-a',
  profileId: 'p1',
  policyId: 'pol',
  reason: 'Logins are told apart by type',
  changes,
  ...extra,
});

test('a query refused for a hidden column is refused at once: no card, nothing waits', async () => {
  const store = storeWithFakeDatabase(() => ({ error: 'hidden', errorType: 'policy', hidden: hiddenType }));
  withPolicy(store);
  stubBridge();
  const result = await run(store, 'claude-a', "activity | where: type = 'x'");
  assert.equal(result.error, 'hidden');
  assert.equal(result.approval, undefined);
  assert.equal(store.investigations[0].pendingDecisions.length, 0);
});

test('a proposal is a card, and Apply makes each change to the connection\'s own policy, then tells the agent', async () => {
  const store = new GlobalStore();
  const calls = withPolicy(store);
  const sent = stubBridge();
  const column = { type: 'column', schema: 'public', table: 'activity', column: 'type' };
  store.handlePolicyProposal(proposal([{ add: column }, { disable: 'h1' }, { enable: 'fk' }, { remove: 'h1' }]));
  const investigation = store.investigations[0];
  assert.equal(investigation.id, 'claude-a');
  assert.equal(investigation.pendingDecisions.length, 1);
  assert.equal(store.agentDecisionsWaiting, 1);

  assert.equal(await store.answerPolicyProposal('claude-a', 'pp-1', true), true);
  assert.deepEqual(calls, [
    ['add', 'pol', column],
    ['enabled', 'pol', 'h1', false],
    ['enabled', 'pol', 'fk', true],
    ['remove', 'pol', 'h1'],
  ]);
  assert.deepEqual(sent.proposals, [{ id: 'pp-1', outcome: { applied: true } }]);
  assert.equal(investigation.proposal('pp-1').status, 'applied');
  assert.equal(investigation.pendingDecisions.length, 0);
  // An answered card can't be answered again.
  assert.equal(await store.answerPolicyProposal('claude-a', 'pp-1', true), false);

  // Undo puts the rules back as they were, without telling the agent.
  assert.equal(await store.undoPolicyProposal('claude-a', 'pp-1'), true);
  assert.deepEqual(calls.at(-1), ['set', 'pol', ['h1', 'fk']]);
  assert.equal(investigation.proposal('pp-1').status, 'undone');
  assert.equal(sent.proposals.length, 1);
});

test('declining a proposal changes nothing and sends the user\'s reason', async () => {
  const store = new GlobalStore();
  const calls = withPolicy(store);
  const sent = stubBridge();
  store.handlePolicyProposal(proposal([{ disable: 'h1' }]));
  assert.equal(await store.answerPolicyProposal('claude-a', 'pp-1', false, 'tokens stay hidden'), true);
  assert.deepEqual(calls, []);
  assert.deepEqual(sent.proposals, [{ id: 'pp-1', outcome: { applied: false, comment: 'tokens stay hidden' } }]);
  assert.equal(store.investigations[0].proposal('pp-1').status, 'declined');
});

test('a proposal the agent stopped waiting on, or for a policy the connection no longer has, is not applied', async () => {
  const store = new GlobalStore();
  const calls = withPolicy(store);
  stubBridge();
  store.handlePolicyProposal(proposal([{ disable: 'h1' }]));
  store.expirePolicyProposal('pp-1');
  assert.equal(store.investigations[0].proposal('pp-1').status, 'expired');
  assert.equal(await store.answerPolicyProposal('claude-a', 'pp-1', true), false);

  store.handlePolicyProposal(proposal([{ disable: 'h1' }], { id: 'pp-2', policyId: 'old-policy' }));
  assert.equal(await store.answerPolicyProposal('claude-a', 'pp-2', true), false);
  assert.deepEqual(calls, []);
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
  store.handlePolicyProposal(proposal([{ disable: 'h1' }]));
  store.focusAgentTab();
  const investigation = store.investigations[0];
  store.closeTab(investigation.sessionId);
  assert.ok(!store.visibleSessionIds.includes(investigation.sessionId));
  assert.equal(store.investigations.length, 1);
  assert.equal(sent.proposals.length, 0, 'the agent is still waiting for an answer');
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


test('a connection\'s policy is its own: a template is never taken for it, and attaching one refreshes both', async () => {
  const store = new GlobalStore();
  const attached = [];
  let policies = [
    { id: 'tpl', name: 'Default', rules: [] },
    { id: 'own', name: 'Default for Prod', rules: [], connectionId: 'p1', template: { id: 'tpl', name: 'Default' } },
  ];
  globalThis.window = {
    beamlynxDesktop: {
      credentials: {
        attachTemplate: async (id, templateId) => {
          attached.push({ id, templateId });
          policies = [policies[0], { id: 'own-2', name: 'Default for Prod', rules: [], connectionId: 'p1' }];
          return { ok: true, profile: { id, policyId: 'own-2', mcpEnabled: true } };
        },
      },
      accessPolicy: { list: async () => policies },
    },
  };
  runInAction(() => {
    store.connections = [
      { id: 'p1', label: 'Prod', mcpEnabled: true, policyId: 'own' },
      // As an older app could leave it: pointing at a template.
      { id: 'p2', label: 'Staging', mcpEnabled: true, policyId: 'tpl' },
    ];
    store.accessPolicies = policies;
  });
  assert.equal(store.connectionPolicy('p1').id, 'own');
  assert.equal(store.connectionPolicy('p2'), undefined);
  assert.deepEqual(store.policyTemplates.map(p => p.id), ['tpl']);

  assert.equal(await store.attachTemplate('p1', 'tpl'), true);
  assert.deepEqual(attached, [{ id: 'p1', templateId: 'tpl' }]);
  assert.equal(store.connectionPolicy('p1').id, 'own-2');
  assert.ok(!store.accessPolicies.some(p => p.id === 'own'));
});

test('a new connection\'s own policy is loaded as soon as it is saved', async () => {
  const store = new GlobalStore();
  store.establishConnection = async () => ({ id: 'pine-1', version: '1.0.0' });
  const own = { id: 'own-new', name: 'Default for db', rules: [], connectionId: 'p-new' };
  const previous = process.env.NEXT_PUBLIC_DESKTOP;
  process.env.NEXT_PUBLIC_DESKTOP = '1';
  globalThis.window = {
    beamlynxDesktop: {
      credentials: {
        save: async () => ({ persisted: true, profile: { id: 'p-new', label: 'db', policyId: 'own-new' } }),
        list: async () => [{ id: 'p-new', label: 'db', policyId: 'own-new', mcpEnabled: false }],
      },
      accessPolicy: { list: async () => [own] },
    },
  };
  try {
    await store.connect({ dbHost: 'h', dbPort: '1', dbName: 'db', dbUser: 'u', dbPassword: 'p' }).catch(() => {});
    assert.ok(store.accessPolicies.some(p => p.id === 'own-new'));
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_DESKTOP;
    else process.env.NEXT_PUBLIC_DESKTOP = previous;
  }
});

test('showing a column the user hid takes out their own Except rule first, whatever schema either names', async () => {
  const store = new GlobalStore();
  const calls = withPolicy(store);
  stubBridge();
  runInAction(() => {
    store.accessPolicies[0].rules.push({
      id: 'hx',
      type: 'hide',
      match: { type: 'column', schema: 'public', table: 'activity', column: 'type' },
      enabled: true,
    });
  });
  const show = { type: 'column', schema: null, table: 'activity', column: 'type' };
  store.handlePolicyProposal(proposal([{ add: show }]));
  assert.equal(await store.answerPolicyProposal('claude-a', 'pp-1', true), true);
  assert.deepEqual(calls, [
    ['remove', 'pol', 'hx'],
    ['add', 'pol', show],
  ]);
});
