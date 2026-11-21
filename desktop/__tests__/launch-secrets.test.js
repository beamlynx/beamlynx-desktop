// Tokens the app makes at each launch, and the file the --mcp relay reads the
// control plane's token from. Runs against dist/ (see format.test.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  bearerMatches,
  controlPlaneInfoPath,
  generateToken,
  readControlPlaneInfo,
  removeControlPlaneInfo,
  writeControlPlaneInfo,
} = require('../dist/main/launch-secrets.js');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'beamlynx-secrets-'));

test('a token is 64 hex characters and different every time', () => {
  const a = generateToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, generateToken());
});

test('the control-plane file round-trips', () => {
  const dir = tempDir();
  writeControlPlaneInfo(dir, { port: 33334, token: 'abc' });
  assert.deepEqual(readControlPlaneInfo(dir), { port: 33334, token: 'abc' });
});

test('the control-plane file is readable only by its owner, also when it already existed', { skip: process.platform === 'win32' }, () => {
  const dir = tempDir();
  fs.writeFileSync(controlPlaneInfoPath(dir), '{}', { mode: 0o644 });
  writeControlPlaneInfo(dir, { port: 1, token: 'x' });
  assert.equal(fs.statSync(controlPlaneInfoPath(dir)).mode & 0o777, 0o600);
});

test('a missing, malformed or incomplete file reads as null', () => {
  const dir = tempDir();
  assert.equal(readControlPlaneInfo(dir), null);
  fs.writeFileSync(controlPlaneInfoPath(dir), 'not json');
  assert.equal(readControlPlaneInfo(dir), null);
  fs.writeFileSync(controlPlaneInfoPath(dir), JSON.stringify({ port: 1, token: '' }));
  assert.equal(readControlPlaneInfo(dir), null);
});

test('removing the file is safe when it is already gone', () => {
  const dir = tempDir();
  writeControlPlaneInfo(dir, { port: 1, token: 'x' });
  removeControlPlaneInfo(dir);
  removeControlPlaneInfo(dir);
  assert.equal(readControlPlaneInfo(dir), null);
});

test('bearerMatches accepts only the exact bearer token', () => {
  assert.equal(bearerMatches('Bearer secret', 'secret'), true);
  assert.equal(bearerMatches('Bearer secre', 'secret'), false);
  assert.equal(bearerMatches('Bearer secretX', 'secret'), false);
  assert.equal(bearerMatches('secret', 'secret'), false);
  assert.equal(bearerMatches('bearer secret', 'secret'), false);
  assert.equal(bearerMatches(undefined, 'secret'), false);
  assert.equal(bearerMatches(['Bearer secret'], 'secret'), false);
});
