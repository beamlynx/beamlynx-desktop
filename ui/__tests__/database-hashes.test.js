// On desktop, nothing the UI saves shows a database's address: tabs keep the
// saved connection's id, and colours are kept under the database's hash
// (AGENTS.md, "Never store a database's address, only its hash"). What older
// versions saved, with pine's `host:port:dbname` ids in it, still works and
// is rewritten once the saved connections load.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DevState } = require('../store/dev-state.ts');
const { STORAGE_KEYS, resetPreferenceBackendForTests } = require('../store/preferences.ts');
const { GlobalStore } = require('../store/global.store.ts');

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const PROFILES = [
  { id: 'profile-a', label: 'Staging', dbHost: 'staging.example.com', dbPort: '5432', dbName: 'shop', databaseKey: 'postgres://staging.example.com:5432/shop', databaseKeyHash: HASH_A },
  { id: 'profile-b', label: 'Production', dbHost: 'prod.example.com', dbPort: '5432', dbName: 'shop', databaseKey: 'postgres://prod.example.com:5432/shop', databaseKeyHash: HASH_B },
];
const ADDRESS = /example\.com|:5432/;

// A desktop store, started from `items` in local storage, with PROFILES as
// the saved connections. Returns the store and what it saved.
async function desktopStore(items) {
  const saved = new Map(Object.entries(items).map(([k, v]) => [k, JSON.stringify(v)]));
  DevState.desktop = true;
  global.window = {
    addEventListener: () => {},
    beamlynxDesktop: { credentials: { list: async () => PROFILES } },
  };
  global.localStorage = {
    getItem: k => (saved.has(k) ? saved.get(k) : null),
    setItem: (k, v) => saved.set(k, v),
    removeItem: k => saved.delete(k),
  };
  resetPreferenceBackendForTests();
  const store = new GlobalStore();
  await store.refreshConnections();
  const read = key => (saved.has(key) ? JSON.parse(saved.get(key)) : undefined);
  return { store, read, raw: key => saved.get(key) };
}

test.afterEach(() => {
  DevState.desktop = undefined;
  delete global.window;
  delete global.localStorage;
  resetPreferenceBackendForTests();
});

test('colours an older version kept under ids move to the hash, and keep their colour', async () => {
  const { store, read, raw } = await desktopStore({
    [STORAGE_KEYS.CONNECTION_COLORS]: { 'profile-a': '#111111', 'prod.example.com:5432:shop': '#222222' },
  });
  assert.deepEqual(read(STORAGE_KEYS.CONNECTION_COLORS), { [HASH_A]: '#111111', [HASH_B]: '#222222' });
  assert.doesNotMatch(raw(STORAGE_KEYS.CONNECTION_COLORS), ADDRESS);
  assert.equal(store.getConnectionColor('profile-a'), '#111111');
  assert.equal(store.getConnectionColor('profile-b'), '#222222', "the one kept under pine's id moved to its connection");
});

test("a colour under the saved connection's id wins over one under pine's id", async () => {
  const { read } = await desktopStore({
    [STORAGE_KEYS.CONNECTION_COLORS]: { 'staging.example.com:5432:shop': '#999999', 'profile-a': '#111111' },
  });
  assert.equal(read(STORAGE_KEYS.CONNECTION_COLORS)[HASH_A], '#111111');
});

test('a new connection gets its colour under the hash', async () => {
  const { read } = await desktopStore({});
  const colors = read(STORAGE_KEYS.CONNECTION_COLORS);
  assert.deepEqual(Object.keys(colors).sort(), [HASH_A, HASH_B]);
});

test("tabs older versions saved come back on their saved connection, never on a guess from pine's id", async () => {
  const { store, read, raw } = await desktopStore({
    [STORAGE_KEYS.SESSIONS]: {
      sessions: [
        { expression: 'a', inputMode: 'pine', connectionId: 'prod.example.com:5432:shop', profileId: 'profile-b' },
        { expression: 'b', inputMode: 'pine', connectionId: 'staging.example.com:5432:shop', profileId: '' },
        { expression: 'c', inputMode: 'pine', connectionId: 'profile-a' },
      ],
      activeIndex: 0,
    },
  });
  const byExpression = e => Object.values(store.sessions).find(s => s.expression === e);
  assert.equal(byExpression('a').connectionId, 'profile-b', 'the saved connection, not the address');
  assert.equal(byExpression('b').connectionId, '', 'an address alone could be either of two saved connections');
  assert.equal(byExpression('c').connectionId, 'profile-a', 'as this version saves it');
  const sessions = read(STORAGE_KEYS.SESSIONS).sessions;
  assert.deepEqual(
    sessions.map(s => s.connectionId),
    ['profile-b', '', 'profile-a'],
  );
  assert.ok(sessions.every(s => !('profileId' in s)));
  assert.doesNotMatch(raw(STORAGE_KEYS.SESSIONS), ADDRESS);
});

test("a tab saved with only its saved connection's id reconnects at startup", async () => {
  const { store } = await desktopStore({
    [STORAGE_KEYS.SESSIONS]: { sessions: [{ expression: '', inputMode: 'pine', profileId: 'profile-b' }], activeIndex: 0 },
  });
  const asked = [];
  store.getSavedProfileCredentials = async profileId => {
    asked.push(profileId);
    return {};
  };
  const opened = [];
  store.establishConnection = async params => {
    opened.push(params.id);
    return { id: params.id, version: '0.54.0' };
  };
  // Pine comes up, which reconnects the open tab, as at startup.
  store.version = '0.54.0';
  for (let i = 0; i < 20 && !store.isConnectionLive('profile-b'); i++) await new Promise(r => setImmediate(r));
  assert.deepEqual(asked, ['profile-b']);
  assert.deepEqual(opened, ['profile-b'], "the pool is opened under the saved connection's id");
  assert.equal(store.sessions[store.activeSessionId].connectionId, 'profile-b');
});
