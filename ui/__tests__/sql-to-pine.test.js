// Typing in the SQL panel converts the SQL to Pine (pine-lang's
// docs/sql-to-pine.md), and the tab's Pine, so the canvas, follows it.
// Every request is stubbed: these test the session and canvas, not pine-lang.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Session } = require('../store/session.ts');

const wait = ms => new Promise(r => setTimeout(r, ms));

// fetch that answers /sql-to-pine from `convert` (sql -> body, or a promise
// of one) and every /build with Pine's "own" SQL, so a test can see whether
// a build overwrote the SQL panel.
function stubFetch(convert) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    const json = url.endsWith('/sql-to-pine')
      ? await convert(body.query)
      : // A failed build: the session still takes its SQL, and draws nothing.
        { query: 'SELECT built FROM pine', error: 'stubbed build' };
    return { ok: true, status: 200, json: async () => json };
  };
  return { calls, restore: () => (global.fetch = original) };
}

function newSession() {
  const session = new Session('sql', { connections: [], accessPolicies: [] });
  session.inputMode = 'sql';
  return session;
}

test('a converted SQL replaces the Pine, keeps its values blocks, and runs nothing', async () => {
  const { calls, restore } = stubFetch(() => ({ expression: 'company\n | where: id = 1', warnings: ['w'] }));
  try {
    const session = newSession();
    session.expression = "$n = 'x'\n\nuser";
    const runs = [];
    session.plugins.default = { evaluate: async opts => (runs.push(opts), []) };
    session.query = 'select * from company where id = 1';
    await session.convertSql();
    assert.equal(session.expression, "$n = 'x'\n\ncompany\n | where: id = 1");
    assert.deepEqual(session.sqlConversion, { status: 'converted', message: '', warnings: ['w'] });
    assert.deepEqual(calls[0].body, { query: 'select * from company where id = 1' });
    await wait(400);
    assert.equal(runs.length, 0);
  } finally {
    restore();
  }
});

test("a build of the converted Pine doesn't overwrite the SQL the user typed", async () => {
  const { restore } = stubFetch(() => ({ expression: 'company', warnings: [] }));
  try {
    const session = newSession();
    session.query = 'SELECT * FROM company';
    await session.convertSql();
    await wait(600);
    assert.equal(session.query, 'SELECT * FROM company');
    assert.equal(session.sqlConversion.status, 'converted');

    // Once the Pine changes some other way, the panel shows its SQL again.
    session.expression = 'company | l: 5';
    await wait(600);
    assert.match(session.query, /SELECT built\s+FROM pine/);
    assert.equal(session.sqlConversion.status, 'idle');
  } finally {
    restore();
  }
});

test('a burst of SQL typing is one undo step', async () => {
  const { restore } = stubFetch(sql => ({ expression: `t | where: x = '${sql.slice(-3)}'`, warnings: [] }));
  try {
    const session = newSession();
    const canvas = session.getCanvasStore();
    session.expression = 'original';
    for (const sql of ['select * from t where x = 1', 'select * from t where x = 12', 'select * from t where x = 123']) {
      session.query = sql;
      await session.convertSql();
    }
    assert.equal(session.expression, "t | where: x = '123'");
    canvas.undo();
    assert.equal(session.expression, 'original');
    canvas.redo();
    assert.equal(session.expression, "t | where: x = '123'");

    // Anything else that changes the Pine ends the burst: the next
    // conversion is a step of its own.
    canvas.undo();
    session.query = 'select * from t where x = 9';
    await session.convertSql();
    canvas.undo();
    assert.equal(session.expression, 'original');
  } finally {
    restore();
  }
});

test('undo and redo end a burst, even when they land on the last translation', async () => {
  const { restore } = stubFetch(sql => ({ expression: `t_${sql}`, warnings: [] }));
  try {
    const session = newSession();
    const canvas = session.getCanvasStore();
    session.expression = 'original';
    for (const sql of ['1', '2']) {
      session.query = sql;
      await session.convertSql();
    }
    canvas.undo();
    canvas.redo();
    assert.equal(session.expression, 't_2');
    session.query = '3';
    await session.convertSql();
    canvas.undo();
    assert.equal(session.expression, 't_2');
  } finally {
    restore();
  }
});

test("a translation that changes nothing doesn't start a burst", async () => {
  const { restore } = stubFetch(sql => ({ expression: sql === 'same' ? 'current' : 'changed', warnings: [] }));
  try {
    const session = newSession();
    const canvas = session.getCanvasStore();
    session.expression = 'current';
    session.query = 'same';
    await session.convertSql();
    session.query = 'other';
    await session.convertSql();
    assert.equal(session.expression, 'changed');
    canvas.undo();
    assert.equal(session.expression, 'current');
  } finally {
    restore();
  }
});

test("a slow answer about older SQL doesn't replace a newer one", async () => {
  let releaseFirst;
  const first = new Promise(r => (releaseFirst = r));
  const { restore } = stubFetch(sql =>
    sql === 'old' ? first.then(() => ({ expression: 'old_table', warnings: [] })) : { expression: 'new_table', warnings: [] },
  );
  try {
    const session = newSession();
    session.query = 'old';
    const slow = session.convertSql();
    session.query = 'new';
    await session.convertSql();
    releaseFirst();
    await slow;
    assert.equal(session.expression, 'new_table');
  } finally {
    restore();
  }
});

test("SQL that doesn't convert leaves the Pine and says why", async () => {
  const { restore } = stubFetch(() => ({ error: "Line 1: OFFSET isn't in Pine.", 'error-type': 'sql-unsupported' }));
  try {
    const session = newSession();
    session.expression = 'company';
    session.query = 'select * from company offset 5';
    await session.convertSql();
    assert.equal(session.expression, 'company');
    assert.deepEqual(session.sqlConversion, { status: 'failed', message: "Line 1: OFFSET isn't in Pine.", warnings: [] });
  } finally {
    restore();
  }
});

test('a server without the endpoint says it is too old', async () => {
  const original = global.fetch;
  global.fetch = async () => ({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) });
  try {
    const session = newSession();
    session.query = 'select * from t';
    await session.convertSql();
    assert.equal(session.sqlConversion.message, 'This Pine server is too old to convert SQL.');
  } finally {
    global.fetch = original;
  }
});

test('empty SQL clears the status and sends nothing', async () => {
  const { calls, restore } = stubFetch(() => ({ expression: 'x' }));
  try {
    const session = newSession();
    session.query = '   ';
    await session.convertSql();
    assert.equal(calls.length, 0);
    assert.equal(session.sqlConversion.status, 'idle');
  } finally {
    restore();
  }
});

test('editing the SQL converts after a pause, once', async () => {
  const { calls, restore } = stubFetch(() => ({ expression: 'company', warnings: [] }));
  try {
    const session = newSession();
    for (const q of ['s', 'se', 'select * from company']) {
      session.query = q;
      session.sqlEdited();
    }
    await wait(450);
    const conversions = calls.filter(c => c.url.endsWith('/sql-to-pine'));
    assert.equal(conversions.length, 1);
    assert.equal(conversions[0].body.query, 'select * from company');
  } finally {
    restore();
  }
});
