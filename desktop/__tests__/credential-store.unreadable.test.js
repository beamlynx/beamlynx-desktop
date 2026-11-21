// A connections.json that can't be read or parsed must never be written
// over. It used to read as an empty store, and the next save wrote an empty
// list over every saved connection. See readStore in
// src/main/credential-store.ts.
//
// Runs against dist/ (npm test builds first), with the same require.cache
// electron stub as credential-store.access-policy.test.js.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let userDataDir;
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    app: { getPath: () => path.dirname(userDataDir), getName: () => path.basename(userDataDir) },
    ipcMain: { handle: () => {} },
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'gnome_libsecret',
      encryptString: str => Buffer.from(str, 'utf-8'),
      decryptString: buf => buf.toString('utf-8'),
    },
  },
};

const store = require(path.join(__dirname, '..', 'dist', 'main', 'credential-store.js'));

const input = { dbHost: 'h', dbPort: '5432', dbName: 'db', dbUser: 'u', dbPassword: 'pw' };
const storePath = () => path.join(userDataDir, 'connections.json');

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beamlynx-credstore-unreadable-'));
});

test('a missing file is an empty store, and the first save creates it', () => {
  assert.deepEqual(store.listConnections(), []);
  assert.ok(store.saveConnection(input).persisted);
  assert.equal(store.listConnections().length, 1);
});

for (const [name, content] of [
  ['corrupt JSON', '{"version": 5, "connections": [{"id": "a"'],
  ['JSON that is not a store', '{"something": "else"}'],
]) {
  test(`${name}: shown as no connections, and never written over`, () => {
    fs.writeFileSync(storePath(), content);
    // What the app shows at boot still works.
    assert.deepEqual(store.listConnections(), []);
    assert.equal(store.listAccessPolicies().length, 1); // the built-in template only
    assert.deepEqual(store.getConnection('a'), { ok: false, error: 'not-found' });
    // Every write refuses, naming the file.
    assert.throws(() => store.saveConnection(input), store.StoreUnreadableError);
    assert.throws(() => store.createAccessPolicy('x'), /couldn't read its saved connections/);
    assert.throws(() => store.forgetConnection('a'), store.StoreUnreadableError);
    // An agent is told, rather than shown nothing.
    assert.throws(() => store.listMcpEnabledConnections(), store.StoreUnreadableError);
    assert.equal(fs.readFileSync(storePath(), 'utf-8'), content);
  });
}
