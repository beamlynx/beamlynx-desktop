// A saved SQLite connection (src/main/credential-store.ts): a file path with
// no host, port, user or password. It has no secret, so it must save and read
// back even where the OS credential store is unavailable -- and must never ask
// that store to encrypt or decrypt anything -- while a server database still
// refuses to save there, as before.
//
// electron is stubbed through require.cache, as credential-store.access-policy
// .test.js does; here the credential store is unavailable and any attempt to
// encrypt or decrypt throws, so a test fails if a SQLite profile touches it.
//
// Run with: node --test __tests__
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist', 'main', 'credential-store.js');
assert.ok(fs.existsSync(DIST), 'dist/main/credential-store.js is missing -- run `npm run build` first (npm test does).');

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
      isEncryptionAvailable: () => false,
      getSelectedStorageBackend: () => 'basic_text',
      encryptString: () => {
        throw new Error('a SQLite profile must not be encrypted');
      },
      decryptString: () => {
        throw new Error('a SQLite profile must not be decrypted');
      },
    },
  },
};

const { saveConnection, getConnection, listConnections } = require(DIST);

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beamlynx-sqlite-test-'));
});

const sqlite = (dbName, extra = {}) => ({
  dbType: 'sqlite',
  dbHost: '',
  dbPort: '',
  dbName,
  dbUser: '',
  dbPassword: '',
  ...extra,
});

test('a SQLite profile saves without the OS credential store', () => {
  const result = saveConnection(sqlite('/Users/me/shop.db'));
  assert.equal(result.persisted, true);
  assert.equal(result.profile.dbType, 'sqlite');
  assert.equal(result.profile.dbName, '/Users/me/shop.db');
  assert.equal(listConnections().length, 1);
});

test('a server database still refuses to save when the credential store is unavailable', () => {
  const result = saveConnection({
    dbType: 'postgres',
    dbHost: 'db.example',
    dbPort: '5432',
    dbName: 'shop',
    dbUser: 'u',
    dbPassword: 'p',
  });
  assert.deepEqual(result, { persisted: false });
  assert.equal(listConnections().length, 0);
});

test('the label is the file name unless one is given', () => {
  assert.equal(saveConnection(sqlite('/Users/me/shop.db')).profile.label, 'shop.db');
  assert.equal(saveConnection(sqlite('/Users/me/other.db', { label: ' Orders ' })).profile.label, 'Orders');
});

test('a SQLite profile reads back with an empty password, not as a decryption failure', () => {
  const { profile } = saveConnection(sqlite('/Users/me/shop.db'));
  const result = getConnection(profile.id);
  assert.equal(result.ok, true);
  assert.equal(result.dbPassword, '');
  assert.equal(result.profile.dbType, 'sqlite');
  assert.equal(result.profile.dbName, '/Users/me/shop.db');
});

test('saving the same file again updates its profile; another file is another profile', () => {
  const first = saveConnection(sqlite('/Users/me/shop.db')).profile;
  const again = saveConnection(sqlite('/Users/me/shop.db')).profile;
  assert.equal(again.id, first.id);
  const other = saveConnection(sqlite('/Users/me/archive/shop.db')).profile;
  assert.notEqual(other.id, first.id);
  assert.equal(listConnections().length, 2);
});
