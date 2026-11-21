// Canvas auto-run evaluates the expression 150 ms after every chip change. It
// must never run one that changes data: adding a where chip to narrow an
// update! used to run the update.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mayChangeData } = require('../store/canvas/pine-text.ts');
const { Session } = require('../store/session.ts');

test('mayChangeData sees every write operation, short forms included', () => {
  for (const e of [
    'company | delete! .id',
    'company | where: id = 1 | d! .id',
    'company | update! name = \'x\'',
    'company|u! name = 1',
    'company | DELETE! .id',
  ]) {
    assert.equal(mayChangeData(e), true, e);
  }
});

test('mayChangeData leaves reads alone', () => {
  for (const e of ['company', 'company | where: name = \'update\'', 'company | s: deleted_at', 'updates | l: 5']) {
    assert.equal(mayChangeData(e), false, e);
  }
});

test('auto-run skips an expression that changes data, and runs one that reads', async () => {
  const session = new Session('auto', { autoRunEnabled: true, connections: [], accessPolicies: [] });
  const calls = [];
  session.plugins.default = { evaluate: async opts => (calls.push(opts), []) };

  session.expression = "company | where: id = 1 | update! name = 'x'";
  session.autoRunTrigger();
  await new Promise(r => setTimeout(r, 250));
  assert.equal(calls.length, 0);
  assert.match(session.message, /Auto-run skipped/);

  session.expression = 'company | where: id = 1';
  session.autoRunTrigger();
  await new Promise(r => setTimeout(r, 250));
  assert.equal(calls.length, 1);
});

test('countRows asks the server to count, read-only, on the last block', async () => {
  const session = new Session('count', { connections: [], accessPolicies: [] });
  session.expression = "$n = 'x'\n\ncompany | where: name = $n";
  const sent = [];
  const original = global.fetch;
  global.fetch = async (_url, options) => {
    sent.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({ result: [['count'], [3]] }) };
  };
  try {
    assert.equal(await session.countRows(), 3);
    assert.deepEqual(sent[0].expressions, ["$n = 'x'", 'company | where: name = $n | count:']);
    assert.equal(sent[0]['allow-writes'], false);
  } finally {
    global.fetch = original;
  }
});
