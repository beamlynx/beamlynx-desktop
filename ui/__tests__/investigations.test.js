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
        // As the desktop app answers a request still waiting.
        resolve: async (id, outcome) => {
          sent.reveals.push({ id, outcome });
          return { id, status: outcome.ok ? 'revealed' : 'declined' };
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
  // As the desktop app does: each call changes the stored policy and sends
  // it back, and the store shows it.
  const calls = [];
  let next = 0;
  const store_ = (policyId, change) => {
    const policy = store.accessPolicies.find(p => p.id === policyId);
    const updated = { ...policy, rules: change(policy.rules.map(r => ({ ...r }))) };
    runInAction(() => {
      store.accessPolicies = store.accessPolicies.map(p => (p.id === policyId ? updated : p));
    });
    return updated;
  };
  store.addAccessPolicyRule = async (policyId, rule) => (
    calls.push(['add', policyId, rule]), store_(policyId, rules => [...rules, { ...rule, id: `new-${++next}`, enabled: true }])
  );
  store.removeAccessPolicyRule = async (policyId, id) => (
    calls.push(['remove', policyId, id]), store_(policyId, rules => rules.filter(r => r.id !== id))
  );
  store.setAccessPolicyRuleEnabled = async (policyId, id, on) => (
    calls.push(['enabled', policyId, id, on]),
    store_(policyId, rules => rules.map(r => (r.id === id ? { ...r, enabled: on } : r)))
  );
  store.setAccessPolicyRules = async (policyId, rules) => (
    calls.push(['set', policyId, rules.map(r => r.id)]), store_(policyId, () => rules)
  );
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
  const second = run(store, 'claude-a', 'tenant');
  release();
  await Promise.all([first, second]);
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


test('a connection\'s policy is the one it points at, never "None", and attaching a template refreshes both', async () => {
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
      // As a desktop app older than per-connection policies leaves it: its
      // policy isn't marked as its own yet.
      { id: 'p2', label: 'Staging', mcpEnabled: true, policyId: 'tpl' },
    ];
    store.accessPolicies = policies;
  });
  assert.equal(store.connectionPolicy('p1').id, 'own');
  // Still the policy it uses: never shown as "None".
  assert.equal(store.connectionPolicy('p2').id, 'tpl');
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

// ---- Holding up under failure ----

const { isObservable, observable } = require('mobx');
const { SerialQueue, isStaleCall, SNAPSHOT_ROWS, OLD_SNAPSHOT_ROWS, FULL_SNAPSHOTS } = require('../store/investigations.ts');
const { STALE_MS } = require('../store/agent-activity.ts');
const { MAX_INVESTIGATIONS, INVESTIGATION_IDLE_MS } = require('../store/global.store.ts');

test('a serial queue runs tasks in order, one at a time, and a failure doesn\'t stop the next', async () => {
  const queue = new SerialQueue();
  const log = [];
  let release;
  const gate = new Promise(resolve => (release = resolve));
  const first = queue.run(async () => {
    log.push('first start');
    await gate;
    log.push('first end');
    throw new Error('first failed');
  });
  const second = queue.run(async () => {
    log.push('second');
    return 2;
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(log, ['first start'], 'the second waits its turn');
  release();
  await assert.rejects(first, /first failed/);
  assert.equal(await second, 2);
  assert.deepEqual(log, ['first start', 'first end', 'second']);
});

test('an investigation\'s queries run one at a time: each step keeps its own result', async () => {
  let release;
  const gate = new Promise(resolve => (release = resolve));
  let inFlight = 0;
  let most = 0;
  const store = storeWithFakeDatabase(async expression => {
    most = Math.max(most, ++inFlight);
    if (expression === 'user') await gate;
    inFlight--;
    return { rows: [{ q: expression }] };
  });
  const first = run(store, 'claude-a', 'user');
  const second = run(store, 'claude-a', 'tenant');
  release();
  await Promise.all([first, second]);
  assert.equal(most, 1);
  const [a, b] = store.investigations[0].steps;
  assert.deepEqual(a.snapshot.rows, [{ q: 'user' }]);
  assert.deepEqual(b.snapshot.rows, [{ q: 'tenant' }]);
});

test('the desktop app can stop an agent\'s query: one still waiting its turn never runs', async () => {
  let release;
  const gate = new Promise(resolve => (release = resolve));
  const ran = [];
  const store = storeWithFakeDatabase(async expression => {
    ran.push(expression);
    if (expression === 'user') await gate;
    return { rows: [] };
  });
  const runWith = (expression, requestId) =>
    store.runMcpQuery({ profileId: 'p1', expression, investigationId: 'claude-a', requestId });
  const first = runWith('user', 'r1');
  const second = runWith('tenant', 'r2');
  store.cancelMcpQuery('r2');
  release();
  await first;
  await assert.rejects(second, /Stopped before it ran/);
  assert.deepEqual(ran, ['user']);
  const step = store.investigations[0].steps[1];
  assert.equal(step.running, false);
  assert.match(step.error, /Stopped before it ran/);
});

test('a running agent query the desktop app gives up on is stopped on the server', async () => {
  let release;
  const gate = new Promise(resolve => (release = resolve));
  const store = storeWithFakeDatabase(async () => {
    await gate;
    return { rows: [] };
  });
  const pending = store.runMcpQuery({ profileId: 'p1', expression: 'user', investigationId: 'claude-a', requestId: 'r1' });
  await new Promise(resolve => setImmediate(resolve));
  const session = store.sessions[store.investigations[0].sessionId];
  let stopped = 0;
  session.stop = async () => void stopped++;
  store.cancelMcpQuery('r1');
  release();
  await pending;
  assert.equal(stopped, 1);
});

test('a connection pine-lang no longer has is made again, once', async () => {
  let runs = 0;
  const store = storeWithFakeDatabase(() =>
    ++runs === 1 ? { error: "Connection `c` isn't connected.", errorType: 'no-connection' } : { rows: [{ id: 1 }] },
  );
  const deps = store.mcpQueryDeps;
  const forgotten = [];
  store.forgetMcpConnection = profileId => forgotten.push(profileId);
  store.mcpQueryDeps = id => deps(id);
  const result = await run(store, 'claude-a', 'user');
  assert.equal(runs, 2);
  assert.deepEqual(forgotten, ['p1']);
  assert.equal(result.error, '');
  assert.equal(store.investigations[0].steps[0].rowCount, 1);
});

test('a step keeps its result as plain data, and big or old results only in part', () => {
  const investigation = new Investigation('claude-a', 's1');
  const snapshot = rows => ({ expression: 'x', columns: [], rows, columnMetadata: {}, columnVisibilityModel: {}, error: '' });
  const many = Array.from({ length: SNAPSHOT_ROWS + 10 }, (_, i) => ({ i }));
  const big = investigation.startQuery('x', 'agent');
  investigation.finishQuery(big, snapshot(many));
  const step = investigation.steps[0];
  assert.equal(step.rowCount, SNAPSHOT_ROWS + 10, 'counted before any are dropped');
  assert.equal(step.snapshot.rows.length, SNAPSHOT_ROWS);
  assert.equal(step.snapshot.rowsDropped, 10);
  assert.equal(isObservable(step.snapshot), false);
  assert.equal(isObservable(step.snapshot.rows), false);

  for (let i = 0; i < FULL_SNAPSHOTS; i++) {
    investigation.finishQuery(investigation.startQuery('y', 'agent'), snapshot([{ i }]));
  }
  assert.equal(investigation.steps[0].snapshot.rows.length, OLD_SNAPSHOT_ROWS);
  assert.equal(investigation.steps[0].rowCount, SNAPSHOT_ROWS + 10);
  assert.equal(investigation.steps.at(-1).snapshot.rows.length, 1);
});

test('a call whose end was lost stops showing as running, and an end without a start is kept', () => {
  const investigation = new Investigation('claude-a', 's1');
  const at = 1000;
  investigation.apply({ id: '1', tool: 'find_tables', phase: 'start', at, summary: 'Searching' });
  assert.equal(isStaleCall(investigation.steps[0], at + 10), false);
  assert.equal(isStaleCall(investigation.steps[0], at + STALE_MS), true);
  investigation.apply({ id: '2', tool: 'get_pine_doc', phase: 'end', at: at + 5, summary: 'Reading the docs', ok: true });
  const late = investigation.steps[1];
  assert.equal(late.summary, 'Reading the docs');
  assert.equal(late.endedAt, at + 5);
});

test('a proposal from the observable store reaches the desktop app as plain data', async () => {
  const store = new GlobalStore();
  const sent = [];
  globalThis.window = {
    beamlynxDesktop: {
      accessPolicy: {
        // IPC clones what it is sent; a MobX proxy can't be.
        addRule: async (policyId, rule) => {
          sent.push(structuredClone(rule));
          return { id: policyId, name: 'x', rules: [] };
        },
      },
    },
  };
  runInAction(() => (store.accessPolicies = [{ id: 'pol', name: 'x', rules: [] }]));
  const rule = observable({ type: 'column', schema: 'public', table: 'activity', column: 'type' });
  await store.addAccessPolicyRule('pol', rule);
  assert.deepEqual(sent, [{ type: 'column', schema: 'public', table: 'activity', column: 'type' }]);
});

test('a change that throws puts the policy back and is passed on, and the card can be answered again', async () => {
  const store = new GlobalStore();
  const calls = withPolicy(store);
  stubBridge();
  store.setAccessPolicyRuleEnabled = async () => {
    throw new Error('An object could not be cloned.');
  };
  store.handlePolicyProposal(proposal([{ remove: 'h1' }, { disable: 'fk' }]));
  await assert.rejects(store.answerPolicyProposal('claude-a', 'pp-1', true), /could not be cloned/);
  assert.deepEqual(calls.at(-1), ['set', 'pol', ['h1', 'fk']]);
  assert.deepEqual(store.accessPolicies[0].rules.map(r => r.id), ['h1', 'fk']);
  assert.equal(store.investigations[0].proposal('pp-1').status, 'pending');
});

test('applied after the agent stopped waiting: saved, and the card says the agent wasn\'t told', async () => {
  const store = new GlobalStore();
  withPolicy(store);
  const sent = stubBridge();
  window.beamlynxDesktop.mcp.resolvePolicyProposal = async (id, outcome) => (sent.proposals.push({ id, outcome }), false);
  store.handlePolicyProposal(proposal([{ disable: 'h1' }]));
  assert.equal(await store.answerPolicyProposal('claude-a', 'pp-1', true), true);
  const card = store.investigations[0].proposal('pp-1');
  assert.equal(card.status, 'applied');
  assert.equal(card.agentGone, true);
  assert.equal(store.accessPolicies[0].rules.find(r => r.id === 'h1').enabled, false);
});

test('Undo is refused once the policy changed after Apply, so a later edit is never erased', async () => {
  const store = new GlobalStore();
  const calls = withPolicy(store);
  stubBridge();
  store.handlePolicyProposal(proposal([{ disable: 'h1' }]));
  await store.answerPolicyProposal('claude-a', 'pp-1', true);
  // The user hides a column afterwards.
  await store.addAccessPolicyRule('pol', { type: 'hide', match: { type: 'column', table: 'user', column: 'email' } });
  const before = calls.length;
  await assert.rejects(store.undoPolicyProposal('claude-a', 'pp-1'), /Undo it in Settings/);
  assert.equal(calls.length, before, 'nothing was written');
  assert.equal(store.investigations[0].proposal('pp-1').status, 'applied');
  assert.ok(store.accessPolicies[0].rules.some(r => r.type === 'hide' && r.match.column === 'email'));
});

test('a reveal request sent again, as after a reload, keeps its one card and isn\'t run twice', async () => {
  const { store, runs, restore } = storeForReveals({ rows: [{ email: 'x' }] });
  try {
    stubBridge();
    await store.handleRevealRequest({ ...revealRequest, id: 'rv-again' });
    await store.handleRevealRequest({ ...revealRequest, id: 'rv-again' });
    const cards = store.investigations[0].steps.filter(s => s.kind === 'reveal');
    assert.equal(cards.length, 1);
    assert.equal(runs.length, 1);
  } finally {
    restore();
  }
});

test('a reveal preview that never finishes is declined for the agent, and nothing waits on it', async () => {
  const store = storeWithFakeDatabase(() => ({ rows: [] }));
  store.ensureProfileConnection = async () => 'conn-1';
  store.revealPreviewTimeoutMs = 20;
  const original = DefaultPlugin.prototype.evaluate;
  DefaultPlugin.prototype.evaluate = () => new Promise(() => {});
  try {
    const sent = stubBridge();
    await store.handleRevealRequest({ ...revealRequest, id: 'rv-slow' });
    const card = store.investigations[0].reveal('rv-slow');
    assert.equal(card.status, 'declined');
    assert.match(card.note, /took longer than/);
    assert.equal(sent.reveals[0].outcome.ok, false);
    assert.equal(store.agentDecisionsWaiting, 0);
  } finally {
    DefaultPlugin.prototype.evaluate = original;
  }
});

test('a reveal request the agent stopped waiting on can no longer be answered', async () => {
  const { store, restore } = storeForReveals({ rows: [{ email: 'x' }] });
  try {
    const sent = stubBridge();
    await store.handleRevealRequest({ ...revealRequest, id: 'rv-exp' });
    store.expireRevealRequest('rv-exp');
    const card = store.investigations[0].reveal('rv-exp');
    assert.equal(card.status, 'expired');
    assert.equal(store.agentDecisionsWaiting, 0);
    assert.equal(await store.answerReveal('claude-a', 'rv-exp', true), false);
    assert.equal(sent.reveals.length, 0);
  } finally {
    restore();
  }
});

test('past the limit, the oldest finished investigation is dropped with its tab; one in use never is', () => {
  const store = new GlobalStore();
  const old = Date.now() - INVESTIGATION_IDLE_MS - 1000;
  for (let i = 0; i < MAX_INVESTIGATIONS; i++) {
    const investigation = store.getOrCreateInvestigation(`claude-${i}`);
    runInAction(() => (investigation.lastCallAt = old + i));
  }
  // The oldest still has a decision waiting, so the next oldest goes.
  store.handlePolicyProposal(proposal([{ disable: 'h1' }], { investigationId: 'claude-0' }));
  const goneSession = store.investigations.find(i => i.id === 'claude-1').sessionId;
  store.getOrCreateInvestigation('claude-new');
  const ids = store.investigations.map(i => i.id);
  assert.equal(ids.length, MAX_INVESTIGATIONS);
  assert.ok(ids.includes('claude-0'));
  assert.ok(!ids.includes('claude-1'));
  assert.equal(store.sessions[goneSession], undefined);
});

test('asking for a Settings section that is already open still draws attention to it', () => {
  const store = new GlobalStore();
  store.showSettingsSection('mcp');
  store.showSettingsSection('mcp');
  assert.equal(store.showSettings, true);
  assert.equal(store.settingsSection, 'mcp');
  assert.equal(store.settingsAttentionCount, 2);
});

test('an answer the desktop app no longer waits for marks the card expired', async () => {
  const { store, restore } = storeForReveals({ rows: [{ email: 'x' }] });
  try {
    const sent = stubBridge();
    window.beamlynxDesktop.mcpReveal.resolve = async (id, outcome) => (sent.reveals.push({ id, outcome }), null);
    await store.handleRevealRequest({ ...revealRequest, id: 'rv-late' });
    assert.equal(await store.answerReveal('claude-a', 'rv-late', true), false);
    assert.equal(store.investigations[0].reveal('rv-late').status, 'expired');
    assert.equal(store.agentDecisionsWaiting, 0);
  } finally {
    restore();
  }
});

test('a proposal sent again after a reload keeps its one card', () => {
  const store = new GlobalStore();
  withPolicy(store);
  store.handlePolicyProposal(proposal([{ disable: 'h1' }]));
  store.handlePolicyProposal(proposal([{ disable: 'h1' }]));
  assert.equal(store.investigations[0].steps.filter(s => s.kind === 'proposal').length, 1);
});

test('an agent query that never ends gives up its place, so the next one still runs', async () => {
  const store = storeWithFakeDatabase(expression => (expression === 'stuck' ? new Promise(() => {}) : { rows: [{ id: 1 }] }));
  store.mcpQueryDeadlineMs = 20;
  const first = run(store, 'claude-a', 'stuck');
  const session = store.sessions[store.investigations[0].sessionId];
  let stopped = 0;
  session.stop = async () => void stopped++;
  const second = run(store, 'claude-a', 'user');
  await assert.rejects(first, /ran for more than/);
  assert.equal((await second).error, '');
  assert.equal(stopped, 1);
  const [stuck, next] = store.investigations[0].steps;
  assert.equal(stuck.running, false);
  assert.match(stuck.error, /ran for more than/);
  assert.equal(next.rowCount, 1);
});
