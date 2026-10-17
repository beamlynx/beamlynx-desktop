// A database that can't be reached (pine-lang's error-type
// "database-unreachable"): the build is tried again until it's back, a run
// builds again, and the canvas isn't left stuck on its last graph.
// Every request is stubbed: these test the session, not pine-lang.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Session } = require('../store/session.ts');
const { GlobalStore } = require('../store/global.store.ts');

const wait = ms => new Promise(r => setTimeout(r, ms));

const unreachable = {
  'connection-id': 'db',
  'error-type': 'database-unreachable',
  error: "Can't reach the database. Connection to localhost:5435 refused.",
};
// A real /build answer for `customers`, with its hints emptied.
const built = {
  'connection-id': 'db',
  ast: {
    hints: { table: [], select: [] },
    where: [],
    'selected-tables': [],
    group: [],
    columns: [
      {
        column: 'id',
        alias: 'c_0',
        'column-alias': '__c_0__id',
        hidden: true,
        'auto-id': true,
        'operation-index': 1,
      },
    ],
    operation: { type: 'table', value: { table: 'customers' } },
    joins: [],
    checkpoints: [],
    assign: null,
    'pending-assignments': {},
    current: 'c_0',
    context: null,
    order: [],
    ranges: [{ alias: null, start: { line: 0, character: 0 }, end: { line: 0, character: 9 } }],
    'named-results': {},
    prettified: 'customers',
  },
  query: 'SELECT 1',
};

// fetch that answers each /build with the next of `answers` (the last one
// repeats), and counts the builds.
function stubBuilds(answers) {
  const original = global.fetch;
  const state = { builds: 0 };
  global.fetch = async url => {
    let json = {};
    if (url.endsWith('/build')) {
      json = answers[Math.min(state.builds, answers.length - 1)];
      state.builds++;
    }
    return { ok: true, status: 200, json: async () => json };
  };
  return { state, restore: () => (global.fetch = original) };
}

function newSession() {
  const session = new Session('unreachable', { connections: [], accessPolicies: [] });
  session.connectionId = 'db';
  return session;
}

test('a build that cannot reach the database marks the tab, and the next answer clears it', async () => {
  const { state, restore } = stubBuilds([unreachable, built]);
  try {
    const reachable = [];
    const session = new Session('unreachable', {
      connections: [],
      accessPolicies: [],
      databaseReachable: id => reachable.push(id),
    });
    session.connectionId = 'db';
    session.expression = 'company';
    await wait(400);
    assert.equal(state.builds, 1);
    assert.equal(session.databaseUnreachable, true);
    assert.equal(session.unreachable, unreachable.error);
    assert.equal(session.buildFailed, true);
    // Nothing polls on its own: the store asks for the next try.
    await wait(400);
    assert.equal(state.builds, 1);
    session.rebuild();
    await wait(400);
    assert.equal(state.builds, 2);
    assert.equal(session.databaseUnreachable, false);
    assert.equal(session.buildFailed, false);
    assert.deepEqual(reachable, ['db'], 'tells the store the database is back');
  } finally {
    restore();
  }
});

test("a build that failed outright doesn't count as having fresh hints for the cursor", async () => {
  const { state, restore } = stubBuilds([unreachable, built]);
  try {
    const session = newSession();
    session.updateCursorPosition(0, 7);
    session.expression = 'company';
    await wait(400);
    assert.equal(session.lastHintsCursorPosition, undefined);
    // What ensureSessionConnected does once the connection is back.
    session.requestHints();
    await wait(400);
    assert.equal(state.builds, 2);
    assert.deepEqual(session.lastHintsCursorPosition, { line: 0, character: 7 });
  } finally {
    restore();
  }
});

test('a run builds again when the last build drew nothing', async () => {
  const { state, restore } = stubBuilds([unreachable, built]);
  try {
    const session = newSession();
    session.plugins.default = { evaluate: async () => [] };
    session.expression = 'company';
    await wait(400);
    assert.equal(state.builds, 1);
    await session.evaluate();
    await wait(400);
    assert.equal(state.builds, 2);
    assert.ok(session.ast);
  } finally {
    restore();
  }
});

test('when the database answers, the other stuck tabs on it build again, so switching to one shows its graph', async () => {
  const { state, restore } = stubBuilds([unreachable]);
  try {
    const store = new GlobalStore();
    const a = store.sessions[store.activeSessionId];
    store.addTab();
    const b = store.sessions[store.activeSessionId];
    store.addTab();
    const other = store.sessions[store.activeSessionId];
    for (const [session, connectionId] of [
      [a, 'db'],
      [b, 'db'],
      [other, 'elsewhere'],
    ]) {
      session.connectionId = connectionId;
      session.unreachable = 'Can\u2019t reach the database.';
    }
    const rebuilt = [];
    for (const session of [a, b, other]) session.rebuild = () => rebuilt.push(session.id);
    store.databaseReachable('db');
    assert.deepEqual(rebuilt.sort(), [a.id, b.id].sort());
    assert.equal(state.builds, 0);
  } finally {
    restore();
  }
});

test('switching to a tab whose last build drew nothing builds it again', () => {
  const store = new GlobalStore();
  const a = store.sessions[store.activeSessionId];
  store.addTab();
  const b = store.sessions[store.activeSessionId];
  a.connectionId = 'db';
  a.unreachable = 'Can’t reach the database.';
  store.liveConnectionIds = ['db'];
  let rebuilt = 0;
  a.rebuild = () => rebuilt++;
  store.activeSessionId = a.id;
  assert.equal(rebuilt, 1);
  store.activeSessionId = b.id;
  assert.equal(rebuilt, 1);
});
