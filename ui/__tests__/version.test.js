// semver.lt throws on anything that isn't a full version. The version check
// used to call it on the server's raw version string.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeServerVersion } = require('../utils/version.ts');

test('full versions pass through', () => {
  assert.equal(normalizeServerVersion('0.48.1'), '0.48.1');
  assert.equal(normalizeServerVersion('0.49.0-SNAPSHOT'), '0.49.0-SNAPSHOT');
});

test('near-versions are coerced', () => {
  assert.equal(normalizeServerVersion('v0.48.1'), '0.48.1');
  assert.equal(normalizeServerVersion('0.48'), '0.48.0');
});

test('anything unreadable is null, never a throw', () => {
  for (const v of ['dev', '', '   ', undefined, null, 48, {}]) {
    assert.equal(normalizeServerVersion(v), null, String(v));
  }
});
