// A database that can't be reached (pine-lang's error-type
// "database-unreachable"): the build is tried again until it's back, a run
// builds again, and the canvas isn't left stuck on its last graph.
// Every request is stubbed: these test the session, not pine-lang.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Session, BUILD_RETRY_FIRST_MS } = require('../store/session.ts');

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

test('a build that cannot reach the database is tried again, until the database answers', async () => {
  const { state, restore } = stubBuilds([unreachable, built]);
  try {
    const session = newSession();
    session.expression = 'company';
    await wait(400);
    assert.equal(state.builds, 1);
    assert.equal(session.databaseUnreachable, true);
    await wait(BUILD_RETRY_FIRST_MS + 400);
    assert.equal(state.builds, 2);
    assert.equal(session.databaseUnreachable, false);
    assert.ok(session.ast);
    await wait(BUILD_RETRY_FIRST_MS + 400);
    assert.equal(state.builds, 2, 'no more tries once the database answered');
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
