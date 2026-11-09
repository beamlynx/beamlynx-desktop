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
  assert.equal(store.getConnectionColor('prod.example.com:5432:shop'), '#222222', "pine's id finds it too");
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

test("tabs keep the saved connection's id and drop pine's id, which is an address", async () => {
  const { store, read, raw } = await desktopStore({
    [STORAGE_KEYS.SESSIONS]: {
      sessions: [
        { expression: 'a', inputMode: 'pine', connectionId: 'prod.example.com:5432:shop', profileId: 'profile-b' },
        { expression: 'b', inputMode: 'pine', connectionId: 'staging.example.com:5432:shop', profileId: '' },
        { expression: 'c', inputMode: 'pine', connectionId: 'gone.example.com:5432:old', profileId: '' },
      ],
      activeIndex: 0,
    },
  });
  const sessions = read(STORAGE_KEYS.SESSIONS).sessions;
  assert.deepEqual(
    sessions.map(s => s.profileId),
    ['profile-b', 'profile-a', ''],
    "an old tab with only pine's id resolves to its saved connection",
  );
  assert.ok(sessions.every(s => !('connectionId' in s)));
  assert.doesNotMatch(raw(STORAGE_KEYS.SESSIONS), ADDRESS);
  const first = Object.values(store.sessions).find(s => s.expression === 'a');
  assert.equal(first.connectionId, 'prod.example.com:5432:shop', 'the open tab still knows it in memory');
});
