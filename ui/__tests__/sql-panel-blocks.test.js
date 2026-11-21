// The SQL panel on a tab with several query blocks (Session.blockSql): the
// statement Run runs, with the part of the block the canvas draws
// highlighted. A block ending in `|= name` is a WITH query in it.
// Every request is stubbed: these test the session, not pine-lang.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { Session } = require('../store/session.ts');
const { loadSqlFormatter } = require('../utils/formatSql.ts');

const wait = ms => new Promise(r => setTimeout(r, ms));
// The panel's SQL is formatted: compared here with its spacing collapsed.
const flat = text => text.replace(/\s+/g, ' ').trim();

before(loadSqlFormatter);

// The SQL pine-lang writes for each block: a WITH query for each named
// block before it that the block reads.
const SQL = {
  'a |= x': 'SELECT * FROM a',
  'x | b |= y': 'WITH "x" AS ( SELECT * FROM a ) SELECT * FROM x JOIN b',
  'c |= unused': 'SELECT * FROM c',
  other: 'SELECT 1',
  'y | count:': 'WITH "x" AS ( SELECT * FROM a ), "y" AS ( SELECT * FROM x JOIN b ) SELECT COUNT(*) FROM y',
};

function stubFetch() {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    const { expressions } = JSON.parse(options.body);
    const last = expressions[expressions.length - 1];
    const json = SQL[last] ? { query: SQL[last] } : { error: 'unknown block' };
    return { ok: true, status: 200, json: async () => json };
  };
  return () => (global.fetch = original);
}

function newSession(expression) {
  const session = new Session('sql-blocks', { connections: [], accessPolicies: [] });
  session.inputMode = 'sql';
  session.expression = expression;
  return session;
}

const highlighted = session => session.sqlPanelHighlight.map(r => flat(session.query.slice(r.from, r.to)));

test('the panel shows the one statement, and highlights the block the cursor is in', async () => {
  const restore = stubFetch();
  try {
    const session = newSession('a |= x\n\nx | b |= y\n\ny | count:');
    await wait(400);
    assert.equal(flat(session.query), flat(SQL['y | count:']) + ';');
    assert.equal(session.sqlPanelEditable, true);

    // The cursor in the last block: the statement's own part.
    assert.deepEqual(highlighted(session), ['WITH', 'SELECT COUNT(*) FROM y;']);

    // Picking a block on the canvas moves the cursor to it.
    session.moveCursorToLine(0);
    assert.deepEqual(highlighted(session), ['"x" AS ( SELECT * FROM a )']);
    session.moveCursorToLine(2);
    assert.deepEqual(highlighted(session), ['"y" AS ( SELECT * FROM x JOIN b )']);
  } finally {
    restore();
  }
});

test('a named block no other block reads shows its own SQL, read-only', async () => {
  const restore = stubFetch();
  try {
    const session = newSession('c |= unused\n\na |= x\n\nx | b |= y\n\ny | count:');
    await wait(400);
    session.moveCursorToLine(0);
    assert.equal(flat(session.query), 'SELECT * FROM c;');
    assert.equal(session.sqlPanelEditable, false);
    assert.deepEqual(session.sqlPanelHighlight, []);

    session.moveCursorToLine(6);
    assert.equal(flat(session.query), flat(SQL['y | count:']) + ';');
    assert.equal(session.sqlPanelEditable, true);
  } finally {
    restore();
  }
});

test('two statements: each under its title, read-only, a block highlighted in its own', async () => {
  const restore = stubFetch();
  try {
    const session = newSession('a |= x\n\nother\n\nx | b |= y\n\ny | count:');
    await wait(400);
    assert.match(session.query, /^-- other\n[\s\S]*;\n\n-- y \| count:\n/);
    assert.equal(session.sqlPanelEditable, false);
    session.moveCursorToLine(2);
    assert.deepEqual(highlighted(session), ['SELECT 1;']);
    session.moveCursorToLine(0);
    assert.deepEqual(highlighted(session), ['"x" AS ( SELECT * FROM a )']);
  } finally {
    restore();
  }
});
