// Tests for src/main/mcp/render-bridge.ts: main only sends a query to the
// page once the page says it listens, fails every waiting query the moment
// the page goes away, and cancels a query in the page when it runs out of
// time.
//
// Runs against dist/ (npm test builds first). Same require.cache electron
// stub as the other tests, with an ipcMain that records its listeners so
// the tests can play the page's side.
const { test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const ipcListeners = new Map();
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    ipcMain: {
      on: (channel, listener) => ipcListeners.set(channel, listener),
      handle: () => {},
    },
  },
};

const bridge = require(path.join(__dirname, '..', 'dist', 'main', 'mcp', 'render-bridge.js'));

function fakeWindow() {
  const webContents = new EventEmitter();
  webContents.sent = [];
  webContents.send = (channel, payload) => webContents.sent.push({ channel, payload });
  webContents.isDestroyed = () => false;
  const window = new EventEmitter();
  window.webContents = webContents;
  return window;
}

const pageSaysReady = window => ipcListeners.get('mcp:bridge-ready')({ sender: window.webContents });
const pageAnswers = (requestId, result) =>
  ipcListeners.get('mcp:query-response')({}, { requestId, ok: true, result });
const request = { kind: 'eval', profileId: 'p1', expression: 'user' };

let window;
beforeEach(() => {
  window = fakeWindow();
  bridge.watchBridge(window);
});

test('nothing is sent until the page says it is ready', async () => {
  assert.equal(bridge.isBridgeReady(), false);
  await assert.rejects(bridge.runInRenderer(window, request), { message: bridge.NOT_READY_MESSAGE });
  assert.deepEqual(window.webContents.sent, []);

  pageSaysReady(window);
  assert.equal(bridge.isBridgeReady(), true);
  const result = bridge.runInRenderer(window, request);
  const [sent] = window.webContents.sent;
  assert.equal(sent.channel, 'mcp:query-request');
  pageAnswers(sent.payload.requestId, { rows: [] });
  assert.deepEqual(await result, { rows: [] });
});

test('only the main window\'s own page can say it is ready', () => {
  ipcListeners.get('mcp:bridge-ready')({ sender: fakeWindow().webContents });
  assert.equal(bridge.isBridgeReady(), false);
});

test('a reload fails every waiting query at once, and the page must say ready again', async () => {
  pageSaysReady(window);
  const first = bridge.runInRenderer(window, request);
  const second = bridge.runInRenderer(window, request);

  // A same-document navigation (a hash change) is not a reload.
  window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
  assert.equal(bridge.isBridgeReady(), true);

  window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
  assert.equal(bridge.isBridgeReady(), false);
  await assert.rejects(first, /reloaded/);
  await assert.rejects(second, /reloaded/);
});

test('a crashed page, or a closed window, is not ready', () => {
  pageSaysReady(window);
  window.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
  assert.equal(bridge.isBridgeReady(), false);

  pageSaysReady(window);
  window.emit('closed');
  assert.equal(bridge.isBridgeReady(), false);
});

test('becoming ready again runs the ready callbacks, once per time', () => {
  let calls = 0;
  bridge.onBridgeReady(() => calls++);
  pageSaysReady(window);
  pageSaysReady(window);
  assert.equal(calls, 1);
  window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
  pageSaysReady(window);
  assert.equal(calls, 2);
});

test('a query that runs out of time is cancelled in the page', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    pageSaysReady(window);
    const result = bridge.runInRenderer(window, request);
    const { requestId } = window.webContents.sent[0].payload;
    mock.timers.tick(bridge.RESPONSE_TIMEOUT_MS);
    await assert.rejects(result, { message: 'The query took longer than 60 s and was cancelled.' });
    assert.deepEqual(window.webContents.sent[1], { channel: 'mcp:query-cancel', payload: { requestId } });
    // A late answer is ignored.
    pageAnswers(requestId, { rows: [] });
  } finally {
    mock.timers.reset();
  }
});

test('a query whose caller hangs up is cancelled in the page', async () => {
  pageSaysReady(window);
  const hungUp = new AbortController();
  const result = bridge.runInRenderer(window, request, { signal: hungUp.signal });
  const { requestId } = window.webContents.sent[0].payload;
  hungUp.abort();
  await assert.rejects(result, /cancelled/);
  assert.deepEqual(window.webContents.sent[1], { channel: 'mcp:query-cancel', payload: { requestId } });
});
