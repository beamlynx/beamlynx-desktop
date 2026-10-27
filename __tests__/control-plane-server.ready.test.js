// The control plane answers 503 for work that needs the page while the page
// isn't ready (src/main/mcp/render-bridge.ts), instead of sending it into a
// page that can't answer. GET /ready says which it is. Long-polls never 503:
// they wait on state kept in main.
//
// Runs against dist/ (npm test builds first). Starts the real server on a
// free port, with electron stubbed through require.cache as in the other
// tests.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'beamlynx-control-plane-'));
// One connection open to agents, with no policy ("None"), so a request gets
// past the access check to the readiness check.
fs.mkdirSync(path.join(appData, 'beamlynx-test'));
fs.writeFileSync(
  path.join(appData, 'beamlynx-test', 'connections.json'),
  JSON.stringify({
    version: 5,
    connections: [{ id: 'p1', label: 'Local', dbHost: 'h', dbPort: '5432', dbName: 'db', dbUser: 'u', mcpEnabled: true, policyId: null }],
    accessPolicies: [],
  }),
);
const ipcListeners = new Map();
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    app: { getPath: () => appData, getName: () => 'beamlynx-test' },
    ipcMain: { handle: () => {}, on: (channel, listener) => ipcListeners.set(channel, listener) },
    safeStorage: { isEncryptionAvailable: () => false },
    dialog: { showErrorBox: () => {} },
    BrowserWindow: {},
  },
};

const DIST = path.join(__dirname, '..', 'dist', 'main', 'mcp');
const { startControlPlaneServer } = require(path.join(DIST, 'control-plane-server.js'));
const bridge = require(path.join(DIST, 'render-bridge.js'));

const TOKEN = 'test-token';
const webContents = new EventEmitter();
webContents.sent = [];
webContents.send = (channel, payload) => webContents.sent.push({ channel, payload });
webContents.isDestroyed = () => false;
const window = new EventEmitter();
window.webContents = webContents;
window.isDestroyed = () => false;

let server;
let port;
before(async () => {
  bridge.watchBridge(window);
  server = startControlPlaneServer({ getMainWindow: () => window, token: TOKEN, port: 0 });
  await new Promise(resolve => server.once('listening', resolve));
  port = server.address().port;
});
after(() => server.close());

function call(method, route, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: route,
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
        },
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

test('while the page is not ready, page work gets a 503 saying to try again', async () => {
  assert.deepEqual(await call('GET', '/ready'), { status: 200, body: { ready: false } });
  for (const route of ['/query', '/explain']) {
    const res = await call('POST', route, { profileId: 'p1', expression: 'user' });
    assert.equal(res.status, 503, route);
    assert.match(res.body.error, /still starting.*Try again in a few seconds/);
  }
  assert.deepEqual(webContents.sent.filter(m => m.channel === 'mcp:query-request'), []);
});

test('long-polls are answered while the page is not ready', async () => {
  assert.deepEqual(await call('GET', '/policy-proposal/unknown-id'), { status: 200, body: { status: 'unknown' } });
  assert.deepEqual(await call('GET', '/reveal/unknown-id'), { status: 200, body: { request: null } });
});

test('/ready needs the token like every other route', async () => {
  const res = await new Promise(resolve => {
    http.get({ host: '127.0.0.1', port, path: '/ready' }, r => {
      r.resume();
      resolve(r.statusCode);
    });
  });
  assert.equal(res, 401);
});

test('once the page says it is ready, /ready says so', async () => {
  ipcListeners.get('mcp:bridge-ready')({ sender: webContents });
  assert.deepEqual(await call('GET', '/ready'), { status: 200, body: { ready: true } });
});
