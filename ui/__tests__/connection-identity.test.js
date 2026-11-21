// A tab has one connection id, and everything about its database reads it:
// where its requests go, the sidebar's label, the switcher's checkmark, the
// masking and the delete confirmation. Each test here is a way a tab used to
// show one database and run on another. The server is stubbed, with pine's
// rules: a pool opens under the id it's given, and a request without a
// connection is refused.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runInAction } = require('mobx');
const { DevState } = require('../store/dev-state.ts');
const { resetPreferenceBackendForTests } = require('../store/preferences.ts');
const { GlobalStore } = require('../store/global.store.ts');

const wait = ms => new Promise(r => setTimeout(r, ms));

const SAVED = {
  local: { id: 'local', label: 'Local', dbHost: 'localhost', dbPort: '5432', dbName: 'app', dbUser: 'dev', dbType: 'postgres' },
  prod: { id: 'prod', label: 'Prod', dbHost: 'prod.example.com', dbPort: '5432', dbName: 'app', dbUser: 'ro', dbType: 'postgres' },
};

// A fake pine-lang. `delays` holds a connection id's connect time, in ms.
function fakeServer({ delays = {} } = {}) {
  const server = { pools: new Set(), requests: [], bodies: [], deleted: [] };
  global.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : {};
    const path = String(url).replace(/^.*\/api\/v1\//, '');
    let json = {};
    if (path === 'connection') json = { result: { version: '0.56.0' } };
    else if (path === 'connections' && init.method === 'POST') {
      const id = body.id ?? `${body.user}@${body.host}:${body.port}:${body.dbname}`;
      if (delays[id]) await wait(delays[id]);
      server.pools.add(id);
      json = { 'connection-id': id };
    } else if (path === 'connections') json = { result: { version: '0.56.0', connections: [] } };
    else if (path.endsWith('/connect')) {
      json = { 'connection-id': decodeURIComponent(path.split('/')[1]), version: '0.56.0' };
    } else if (init.method === 'DELETE') {
      const id = decodeURIComponent(path.split('/')[1]);
      server.pools.delete(id);
      server.deleted.push(id);
      json = { result: {} };
    } else {
      const id = body['connection-id'];
      server.requests.push({ path, connectionId: id });
      server.bodies.push({ path, ...body });
      json = id
        ? { 'connection-id': id, ast: { hints: { table: [] } }, result: [], columns: [] }
        : { 'error-type': 'no-connection', error: 'No connection given.' };
    }
    return { ok: true, status: 200, json: async () => json };
  };
  return server;
}

function desktopStore({ saved = Object.values(SAVED), persisted = true } = {}) {
  DevState.desktop = true;
  const store = {};
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => (store[k] = String(v)),
    removeItem: k => delete store[k],
  };
  let nextId = 0;
  global.window = {
    localStorage: global.localStorage,
    location: { hostname: 'localhost', origin: 'http://localhost' },
    addEventListener() {},
    beamlynxDesktop: {
      credentials: {
        list: async () => saved,
        get: async id => {
          const profile = saved.find(c => c.id === id);
          return profile ? { ok: true, profile, dbPassword: 'x' } : { ok: false, error: 'not-found' };
        },
        save: async params => {
          if (!persisted) return { persisted: false };
          const profile = { ...params, id: `saved-${++nextId}`, label: params.label ?? 'New' };
          saved.push(profile);
          return { persisted: true, profile };
        },
      },
      accessPolicy: { list: async () => [] },
    },
  };
  resetPreferenceBackendForTests();
  return new GlobalStore();
}

test.afterEach(() => {
  DevState.desktop = undefined;
  delete global.window;
  delete global.localStorage;
  resetPreferenceBackendForTests();
});

async function started(options) {
  const server = fakeServer(options);
  const store = desktopStore(options);
  await store.loadConnectionMetadata();
  return { server, store };
}

test('closing every tab keeps the closed tab\'s database, and every part of the app names the same one', async () => {
  const { server, store } = await started();
  const tab1 = store.activeSessionId;
  await store.connectToSavedProfile('local');
  store.addTab();
  const tab2 = store.activeSessionId;
  await store.connectToSavedProfile('prod');
  // Back to Local, which is already open. Prod was the connection made last.
  runInAction(() => (store.activeSessionId = tab1));
  store.closeTab(tab2);
  store.closeTab(tab1);

  const tab = store.sessions[store.activeSessionId];
  assert.equal(tab.connectionId, 'local');
  assert.equal(store.getConnectionLabel(tab.connectionId), 'Local', 'the sidebar');
  assert.equal(store.activeConnectionId, 'local', "the switcher's checkmark");
  assert.match(tab.traversalConnectionLabel, /^Local /, 'the delete confirmation');

  runInAction(() => (tab.expression = 'user'));
  await wait(400);
  assert.deepEqual(server.requests.at(-1), { path: 'build', connectionId: 'local' }, 'and the query');
});

test('a tab with no database runs nothing, and its builds name no connection', async () => {
  const { server, store } = await started();
  await store.connectToSavedProfile('prod');
  store.addTab();
  const tab = store.sessions[store.activeSessionId];
  runInAction(() => (tab.connectionId = ''));

  runInAction(() => (tab.expression = 'user'));
  await wait(400);
  assert.deepEqual(server.requests.at(-1), { path: 'build', connectionId: undefined }, 'never another tab\'s');

  const before = server.requests.length;
  await tab.evaluate();
  assert.equal(server.requests.length, before, 'Run sends nothing');
  assert.match(tab.error, /no database/);
});

test('a tab that is still connecting does not run', async () => {
  const { server, store } = await started();
  const tab = store.sessions[store.activeSessionId];
  runInAction(() => {
    tab.connectionId = 'prod';
    tab.connecting = true;
  });
  const before = server.requests.length;
  await tab.evaluate();
  assert.equal(server.requests.length, before);
  assert.match(tab.error, /Still connecting/);
});

test('a slow connect lands on the tab it was picked in, not the one open when it finishes', async () => {
  const { store } = await started({ delays: { prod: 100 } });
  const tab1 = store.activeSessionId;
  await store.connectToSavedProfile('local');
  store.addTab();
  const tab2 = store.activeSessionId;

  const connecting = store.connectToSavedProfile('prod'); // picked in tab 2
  runInAction(() => (store.activeSessionId = tab1));
  await connecting;

  assert.equal(store.sessions[tab1].connectionId, 'local', 'the tab open at the end is untouched');
  assert.equal(store.sessions[tab2].connectionId, 'prod');
});

test('of two picks in one tab, the later one wins even when the earlier finishes last', async () => {
  const { store } = await started({ delays: { prod: 100 } });
  const tab = store.sessions[store.activeSessionId];
  const first = store.connectToSavedProfile('prod');
  const second = store.connectToSavedProfile('local');
  await Promise.all([first, second]);
  assert.equal(tab.connectionId, 'local');
  assert.equal(tab.connecting, false);
});

test("a reconnect that finishes after the tab moved to another database doesn't move it back", async () => {
  const { store } = await started({ delays: { prod: 100 } });
  const tab = store.sessions[store.activeSessionId];
  runInAction(() => (tab.connectionId = 'prod'));
  const reconnecting = store.ensureSessionConnected(store.activeSessionId);
  await store.connectToSavedProfile('local');
  await reconnecting;
  assert.equal(tab.connectionId, 'local');
  assert.equal(tab.connecting, false);
});

test("a result from another database than the tab's isn't shown", async () => {
  const { server, store } = await started();
  await store.connectToSavedProfile('local');
  const tab = store.sessions[store.activeSessionId];
  const fetch = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).endsWith('/eval')) {
      return { ok: true, status: 200, json: async () => ({ 'connection-id': 'prod', result: [[1]], columns: [{ column: 'id' }] }) };
    }
    return fetch(url, init);
  };
  await tab.evaluate();
  assert.equal(tab.rows.length, 0);
  assert.match(tab.error, /different database/);
  assert.ok(server);
});

test('a new connection is checked, saved, and then opened under its saved id', async () => {
  const { server, store } = await started();
  const id = await store.connect({ ...SAVED.local, id: undefined, dbPassword: 'x', label: 'Mine' });
  assert.match(id, /^saved-/);
  assert.equal(store.sessions[store.activeSessionId].connectionId, id);
  assert.ok(server.pools.has(id));
  assert.deepEqual(server.deleted, ['dev@localhost:5432:app'], 'the pool opened only to check it is closed');
});

test('a result is stamped with what its run sent, not with what the editor says by the time it lands', async () => {
  const { store } = await started();
  await store.connectToSavedProfile('local');
  const tab = store.sessions[store.activeSessionId];
  runInAction(() => (tab.expression = 'customer'));
  const fetch = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).endsWith('/eval')) {
      await wait(50);
      return { ok: true, status: 200, json: async () => ({ 'connection-id': 'local', result: [['id'], [1]], columns: [{ column: 'id', alias: 'c_0' }] }) };
    }
    return fetch(url, init);
  };
  const running = tab.evaluate();
  runInAction(() => (tab.expression = 'company')); // typed while it runs
  await running;
  assert.deepEqual(tab.resultSource, { connectionId: 'local', expressions: ['customer'], language: 'pine' });
  assert.equal(tab.expressionAtLastEval, 'customer');
});

test('a tab moved to another database shows nothing from the last one', async () => {
  const { store } = await started();
  await store.connectToSavedProfile('local');
  const tab = store.sessions[store.activeSessionId];
  runInAction(() => {
    tab.rows = [{ 0: 1, _id: 0 }];
    tab.resultSource = { connectionId: 'local', expressions: ['customer'], language: 'pine' };
  });
  await store.connectToSavedProfile('prod');
  assert.deepEqual(tab.rows, []);
  assert.equal(tab.resultSource, null, 'so nothing on screen can be edited on Prod');
});

test("a cell edit's session stays on the connection it was made for, whatever the tabs do", async () => {
  const { server, store } = await started();
  const tab1 = store.activeSessionId;
  await store.connectToSavedProfile('local');
  // What Result.tsx does: a session of the edit's own, on the rows' connection.
  const edit = store.createEditSession('local');
  store.addTab();
  await store.connectToSavedProfile('prod');
  assert.equal(store.activeSessionId !== tab1, true);
  runInAction(() => (edit.expression = "customer | where: id = 1 | update! name = 'x'"));
  await edit.evaluate();
  assert.deepEqual(server.requests.at(-1), { path: 'eval', connectionId: 'local' });
  assert.ok(!Object.values(store.sessions).includes(edit), 'shared with nothing');
});

test('a delete plan runs only on the database it was walked on', async () => {
  const { server, store } = await started();
  await store.connectToSavedProfile('prod');
  const tab = store.sessions[store.activeSessionId];
  // A plan from Local still showing, with the tab on Prod.
  runInAction(() => {
    tab.traversal = {
      verb: 'delete', connectionId: 'local', rootExpression: 'customer', status: 'done',
      nodes: [{ expression: 'customer', count: 1 }], depthCapped: false, script: 'DELETE …',
      queries: ['DELETE FROM customer'], error: null, run: 'confirming', outcomes: [], runFrom: 0,
    };
  });
  const before = server.requests.length;
  await tab.confirmTraversalRun();
  assert.equal(server.requests.length, before, 'nothing ran');
  assert.match(tab.traversal.error, /another database/);
  assert.match(tab.traversalConnectionLabel, /^Local/, 'the confirmation names the plan’s database');
});

test("two saved connections to one address are two connections, each named by its own id", async () => {
  // A local database and a tunnel to another server can both be localhost:5432.
  const tunnel = { ...SAVED.local, id: 'tunnel', label: 'Prod via tunnel' };
  const { server, store } = await started({ saved: [SAVED.local, tunnel] });
  await store.connectToSavedProfile('local');
  store.addTab();
  await store.connectToSavedProfile('tunnel');
  assert.ok(server.pools.has('local') && server.pools.has('tunnel'));
  assert.equal(store.getConnectionLabel(store.activeConnectionId), 'Prod via tunnel');
});

test('auto-run asks pine-lang to refuse writes, so a write it misses still never runs', async () => {
  const { mayChangeData } = require('../store/canvas/pine-text.ts');
  // Pine reads a comment as a space: these are deletes.
  assert.equal(mayChangeData('user | /* x */ delete! .id'), true);
  assert.equal(mayChangeData('user |-- x\n d! .id'), true);

  const { server, store } = await started();
  await store.connectToSavedProfile('local');
  const tab = store.sessions[store.activeSessionId];
  runInAction(() => (tab.expression = 'user'));
  tab.notifyCanvasCommit();
  await wait(300);
  assert.equal(server.bodies.filter(b => b.path === 'eval').at(-1)['allow-writes'], false);
});

test("refreshing the grid runs what produced its rows, read-only, never the editor's text", async () => {
  const { server, store } = await started();
  await store.connectToSavedProfile('local');
  const tab = store.sessions[store.activeSessionId];
  runInAction(() => {
    tab.resultSource = { connectionId: 'local', expressions: ['customer | where: id = 5'], language: 'pine' };
    tab.expression = 'customer | where: id = 5 | delete! .id'; // typed, never run
  });
  await tab.refreshResult();
  const sent = server.bodies.filter(b => b.path === 'eval').at(-1);
  assert.deepEqual(sent.expressions, ['customer | where: id = 5']);
  assert.equal(sent['allow-writes'], false);
});

test('a run of several blocks stops when the tab moves to another database', async () => {
  const { server, store } = await started({ delays: {} });
  await store.connectToSavedProfile('prod');
  const tab = store.sessions[store.activeSessionId];
  runInAction(() => (tab.expression = 'customer\n\ncompany\n\norder | delete! .id'));
  const fetch = global.fetch;
  let evals = 0;
  global.fetch = async (url, init) => {
    if (String(url).endsWith('/eval') && ++evals === 1) await wait(80);
    return fetch(url, init);
  };
  const running = tab.run();
  await wait(20);
  await store.connectToSavedProfile('local'); // during the first block
  await running;
  const ran = server.bodies.filter(b => b.path === 'eval');
  assert.equal(ran.length, 1, 'only the block already running ran');
  assert.equal(ran[0]['connection-id'], 'prod');
});

test("raw SQL doesn't run in an agent's tab, or where masking applies to your own queries", async () => {
  const { server, store } = await started();
  await store.connectToSavedProfile('local');
  const tab = store.sessions[store.activeSessionId];
  runInAction(() => {
    tab.inputMode = 'sql';
    store.connections = store.connections.map(c =>
      c.id === 'local' ? { ...c, policyId: 'p', applyPolicyToOwnQueries: true } : c,
    );
    store.accessPolicies = [{ id: 'p', name: 'p', rules: [{ id: 'r', type: 'foreign-key', enabled: true }] }];
  });
  const before = server.requests.length;
  await tab.evaluate();
  assert.equal(server.requests.filter(r => r.path === 'sql').length, 0);
  assert.equal(server.requests.length, before);
  assert.match(tab.error, /can’t be masked/);
});

test("a link's query can't change data until its banner is dismissed", async () => {
  const { server, store } = await started();
  await store.connectToSavedProfile('local');
  const tab = store.sessions[store.activeSessionId];
  runInAction(() => {
    tab.expression = 'customer | delete! .id';
    tab.openedFromLink = true; // what DeepLinkHandler sets
  });
  await tab.evaluate();
  assert.equal(server.bodies.filter(b => b.path === 'eval').at(-1)['allow-writes'], false);
  runInAction(() => (tab.openedFromLink = false)); // Dismiss
  await tab.evaluate();
  assert.equal(server.bodies.filter(b => b.path === 'eval').at(-1)['allow-writes'], undefined);
});

test("an older run finishing after a newer one doesn't replace its rows", async () => {
  const { store } = await started();
  await store.connectToSavedProfile('local');
  const tab = store.sessions[store.activeSessionId];
  const fetch = global.fetch;
  let n = 0;
  global.fetch = async (url, init) => {
    if (String(url).endsWith('/eval')) {
      const which = ++n;
      await wait(which === 1 ? 80 : 10);
      return { ok: true, status: 200, json: async () => ({ 'connection-id': 'local', result: [['run'], [which]], columns: [{ column: 'run' }] }) };
    }
    return fetch(url, init);
  };
  const older = tab.evaluate();
  const newer = tab.evaluate();
  await Promise.all([older, newer]);
  assert.equal(tab.rows[0][0], 2);
});
