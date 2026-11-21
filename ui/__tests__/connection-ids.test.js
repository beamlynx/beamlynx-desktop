// On desktop a tab's connection id is its saved connection's id, and pine
// opens the pool under it. Pine's own `user@host:port:dbname` id is only
// read to move colours older versions stored under it.
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

test('a tab names its saved connection by that connection\'s own id', async () => {
  const store = await desktopStore();
  assert.equal(store.getConnectionLabel('profile-reader'), 'Reader');
  assert.equal(store.getConnectionLabel('profile-writer'), 'Writer');
});

test('an address is never matched to a saved connection: two can share one', async () => {
  // A local database and a tunnel to another server can both be
  // localhost:5432. Matching by address picked the first, and labelled a
  // tab with the other database.
  const store = await desktopStore();
  assert.equal(store.getConnectionLabel('reader@db.example.com:5432:shop'), 'reader@db.example.com:5432:shop');
  assert.equal(store.getConnectionLabel('db.example.com:5432:shop'), 'db.example.com:5432:shop');
});
