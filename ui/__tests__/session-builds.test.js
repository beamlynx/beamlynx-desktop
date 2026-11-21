// The session's builds: only the latest one's answer is used, a newer one
// cancels the one in flight, and the SQL panel's text is formatted only when
// something reads it. Every request is stubbed.
const { before, test } = require('node:test');
const { observable } = require('mobx');
const assert = require('node:assert/strict');
const { Session } = require('../store/session.ts');
const { formatSql, loadSqlFormatter } = require('../utils/formatSql.ts');

before(() => loadSqlFormatter());

const wait = ms => new Promise(r => setTimeout(r, ms));

// fetch whose /build answers wait until the test releases them.
function heldBuilds() {
  const builds = [];
  const original = global.fetch;
  global.fetch = (_url, options) =>
    new Promise((resolve, reject) => {
      const body = JSON.parse(options.body);
      const build = {
        expression: body.expressions[body.expressions.length - 1],
        signal: options.signal,
        answer: json => resolve({ ok: true, status: 200, json: async () => json }),
      };
      options.signal?.addEventListener('abort', () => {
        build.aborted = true;
        // Like fetch: an aborted request rejects.
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
      builds.push(build);
    });
  return { builds, restore: () => (global.fetch = original) };
}

const astFor = name => ({ hints: { table: [], select: [], order: [], where: [] }, name });

test("an older build's answer never replaces a newer one's", async () => {
  const { builds, restore } = heldBuilds();
  try {
    const session = new Session('seq', { connections: [], accessPolicies: [] });
    session.expression = 'company';
    await wait(250);
    session.expression = 'company | employee';
    await wait(250);
    assert.deepEqual(
      builds.map(b => b.expression),
      ['company', 'company | employee'],
    );
    // The newer build cancelled the older one.
    assert.equal(builds[0].aborted, true);
    assert.equal(builds[1].aborted, undefined);

    builds[1].answer({ ast: astFor('newer'), query: 'SELECT 2' });
    await wait(0);
    // A late answer to the cancelled build is ignored, as is its error.
    builds[0].answer({ ast: astFor('older'), query: 'SELECT 1' });
    await wait(0);
    assert.equal(session.ast.name, 'newer');
    assert.equal(session.error, '');
    assert.equal(session.hintsLoading, false);
  } finally {
    restore();
  }
});

test('a build in flight still answers when no newer build has started', async () => {
  const { builds, restore } = heldBuilds();
  try {
    const session = new Session('slow', { connections: [], accessPolicies: [] });
    session.expression = 'company';
    await wait(250);
    // Typing again, but the next build hasn't started (it waits for a pause).
    session.expression = 'company |';
    builds[0].answer({ ast: astFor('first'), query: 'SELECT 1' });
    await wait(0);
    assert.equal(session.ast.name, 'first');
    // Still loading: the next build is on its way.
    assert.equal(session.hintsLoading, true);
    await wait(250);
    builds[1].answer({ ast: astFor('second'), query: 'SELECT 2' });
    await wait(0);
    assert.equal(session.ast.name, 'second');
    assert.equal(session.hintsLoading, false);
  } finally {
    restore();
  }
});

test("the SQL panel shows the build's SQL, formatted, until typed in", async () => {
  const { builds, restore } = heldBuilds();
  try {
    const global = observable({ connections: [], accessPolicies: [], showHiddenSqlColumns: false });
    const session = new Session('sql', global);
    session.expression = 'company';
    await wait(250);
    builds[0].answer({
      ast: astFor('a'),
      query: 'SELECT c.id, c.__hidden FROM company AS c',
      'query-without-hidden': 'SELECT c.id FROM company AS c',
    });
    await wait(0);
    assert.equal(session.query, formatSql('SELECT c.id FROM company AS c'));
    // Turning the hidden columns on shows the other one.
    global.showHiddenSqlColumns = true;
    assert.equal(session.query, formatSql('SELECT c.id, c.__hidden FROM company AS c'));
    global.showHiddenSqlColumns = false;

    // Typed text is kept until the next build of other Pine.
    session.query = 'select 1';
    assert.equal(session.query, 'select 1');
    session.expression = 'company | l: 1';
    await wait(250);
    builds[1].answer({ ast: astFor('b'), query: 'SELECT c.id FROM company AS c LIMIT 1' });
    await wait(0);
    assert.equal(session.query, formatSql('SELECT c.id FROM company AS c LIMIT 1'));
  } finally {
    restore();
  }
});
