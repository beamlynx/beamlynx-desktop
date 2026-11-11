// A restored tab with several query blocks. The canvas builds each block
// itself, and at startup it does that before the tab has reconnected, so
// those builds fail. Once the tab is connected the blocks are built again;
// the canvas used to say "Not parsing" until the next edit.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const named = require('./fixtures/named-block-asts.json');

// Builds fail until `connected`; then each block gets its fixture AST.
let connected = false;
global.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  if (!connected || !body['connection-id']) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ 'error-type': 'no-connection', error: 'No connection selected.' }),
    };
  }
  const last = body.expressions[body.expressions.length - 1];
  return { ok: true, status: 200, json: async () => ({ ast: last.startsWith('top') ? named.main : named.block }) };
};

const { Session } = require('../store/session.ts');
const { CanvasStore } = require('../store/canvas/canvas.store.ts');

const TAB = '$n = 1\n\ncompany as c | where: id = 1 | limit: 10 |= top\n\ntop | employee as e';
const settle = () => new Promise(r => setTimeout(r, 400));

test('a restored tab builds its blocks again once it has reconnected', async () => {
  const session = new Session('restored', { connections: [], accessPolicies: [] });
  session.expression = TAB;
  const store = new CanvasStore(session);
  const stop = store.start();
  try {
    await settle();
    assert.equal(store.mainAst, undefined);
    assert.equal(store.canvasGraph.parsing, false);

    // The tab reconnects (GlobalStore.ensureSessionConnected).
    connected = true;
    session.connectionId = 'conn-1';
    await settle();
    assert.equal(store.mainAst, named.main);
    assert.notEqual(store.canvasGraph.parsing, false);
    assert.ok(store.canvasGraph.nodes.some(n => n.id === 'e'));
  } finally {
    stop();
    connected = false;
  }
});

test('the blocks are built again after a session build, while one has no build', async () => {
  const session = new Session('restored-2', { connections: [], accessPolicies: [] });
  session.connectionId = 'conn-1';
  session.expression = TAB;
  const store = new CanvasStore(session);
  const stop = store.start();
  try {
    await settle();
    assert.equal(store.mainAst, undefined);

    // Same connection, now reachable: the session's own build comes back.
    connected = true;
    session.response = { ast: named.main };
    await settle();
    assert.equal(store.mainAst, named.main);
  } finally {
    stop();
    connected = false;
  }
});

// Until the tab has its connection, its build errors aren't about the query:
// the canvas says Connecting and no error is shown (Session.connectionPending).
test('a restored tab waits for its connection before it shows errors', () => {
  const session = new Session('restored-3', { connections: [], accessPolicies: [] });
  session.expression = TAB;
  session.awaitingConnection = true;
  const store = new CanvasStore(session);
  assert.equal(session.connectionPending, true);
  assert.equal(store.isConnecting, true);

  // A build before the tab has its connection: still waiting.
  session.response = { 'error-type': 'no-connection', error: 'No connection selected.' };
  assert.equal(session.connectionPending, true);

  // Reconnecting, then the first build on the connection ends the wait.
  session.connecting = true;
  session.connectionId = 'conn-1';
  session.response = { error: 'too early' };
  assert.equal(session.connectionPending, true);
  session.connecting = false;
  session.response = { ast: named.main };
  assert.equal(session.connectionPending, false);
  assert.equal(store.isConnecting, false);
});

test('a real error on the connection ends the wait too, so it shows', () => {
  const session = new Session('restored-4', { connections: [], accessPolicies: [] });
  session.awaitingConnection = true;
  session.connectionId = 'conn-1';
  session.response = { 'error-type': 'parse', error: 'Expected a table' };
  assert.equal(session.connectionPending, false);
  assert.equal(session.error, 'Expected a table');
});
