// Pine names a server connection `user@host:port:dbname`, so the same
// database can be open as two users at once. The UI finds the saved
// connection behind each of those ids, and still finds one for the shorter
// ids older versions saved.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DevState } = require('../store/dev-state.ts');
const { resetPreferenceBackendForTests } = require('../store/preferences.ts');
const { GlobalStore, pineIdOf } = require('../store/global.store.ts');

const PROFILES = [
  { id: 'profile-reader', label: 'Reader', dbHost: 'db.example.com', dbPort: '5432', dbName: 'shop', dbUser: 'reader' },
  { id: 'profile-writer', label: 'Writer', dbHost: 'db.example.com', dbPort: '5432', dbName: 'shop', dbUser: 'writer' },
];

async function desktopStore() {
  DevState.desktop = true;
  global.window = {
    addEventListener: () => {},
    beamlynxDesktop: { credentials: { list: async () => PROFILES } },
  };
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  resetPreferenceBackendForTests();
  const store = new GlobalStore();
  await store.refreshConnections();
  return store;
}

test.afterEach(() => {
  DevState.desktop = undefined;
  delete global.window;
  delete global.localStorage;
  resetPreferenceBackendForTests();
});

test("pine's id holds the user, and leaves it out when there is none", () => {
  assert.equal(pineIdOf(PROFILES[0]), 'reader@db.example.com:5432:shop');
  assert.equal(pineIdOf({ dbHost: 'h', dbPort: '5432', dbName: 'd', dbUser: '' }), 'h:5432:d');
  assert.equal(pineIdOf({ dbHost: '', dbPort: '', dbName: '/data/app.db' }), undefined, 'a SQLite file has no address');
});

test('the same database as two users: each id finds its own saved connection', async () => {
  const store = await desktopStore();
  assert.equal(store.getConnectionLabel('reader@db.example.com:5432:shop'), 'Reader');
  assert.equal(store.getConnectionLabel('writer@db.example.com:5432:shop'), 'Writer');
});

test('an id an older version saved, without the user, still finds a saved connection', async () => {
  const store = await desktopStore();
  assert.equal(store.getConnectionLabel('db.example.com:5432:shop'), 'Reader');
});
