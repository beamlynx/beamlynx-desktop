// The command that opens Beamlynx's own data file, beamlynx.db, as a SQLite
// connection in a new tab (GlobalStore.openAppDataFile).
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { GlobalStore } = require('../store/global.store.ts');
const { getAllCommands } = require('../utils/commands.ts');

afterEach(() => {
  delete globalThis.window;
});

const FILE = '/home/me/.config/beamlynx-desktop/beamlynx.db';

function store() {
  const s = new GlobalStore();
  // After the store, whose constructor needs a real window.
  globalThis.window = { beamlynxDesktop: { appDb: { path: async () => FILE } } };
  const calls = [];
  s.connect = async params => {
    calls.push({ connect: params, tab: s.activeSessionId });
    return 'c';
  };
  s.connectToSavedProfile = async id => {
    calls.push({ saved: id, tab: s.activeSessionId });
    return 'c';
  };
  return { s, calls };
}

test('the first time, it connects to the file in a new tab and saves it with a name', async () => {
  const { s, calls } = store();
  const before = s.activeSessionId;
  await s.openAppDataFile();
  assert.equal(calls.length, 1);
  assert.notEqual(calls[0].tab, before, 'a new tab');
  assert.deepEqual(calls[0].connect, {
    dbType: 'sqlite', dbName: FILE, dbHost: '', dbPort: '', dbUser: '', dbPassword: '', label: 'Beamlynx data (beamlynx.db)',
  });
});

test('after that, it reuses the saved connection', async () => {
  const { s, calls } = store();
  s.connections = [{ id: 'p1', label: 'Beamlynx data (beamlynx.db)', dbHost: '', dbPort: '', dbName: FILE }];
  await s.openAppDataFile();
  assert.deepEqual(calls.map(c => c.saved), ['p1']);
});

test('the command is offered only where the desktop app can say where the file is', () => {
  const command = getAllCommands().find(c => c.id === 'open-app-data-file');
  assert.equal(command.isEnabled(), false);
  globalThis.window = { beamlynxDesktop: { appDb: { path: async () => FILE } } };
  assert.equal(command.isEnabled(), true);
});
