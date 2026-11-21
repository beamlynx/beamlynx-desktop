// Tests for where usage stats and sign-in go (src/main/service-config.ts): a
// release build reads the file, a dev build may use environment variables,
// and without either both are off.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist', 'main', 'service-config.js');
assert.ok(fs.existsSync(DIST), 'dist/main/service-config.js is missing -- run `npm run build` first (npm test does).');
const { loadServiceConfig } = require(DIST);

const missing = path.join(os.tmpdir(), 'no-such-service-config.json');

afterEach(() => {
  delete process.env.BEAMLYNX_SUPABASE_URL;
  delete process.env.BEAMLYNX_POSTHOG_KEY;
});

test('without the file, both are off', () => {
  assert.deepEqual(loadServiceConfig(true, missing), {
    posthogKey: null,
    posthogHost: 'https://eu.i.posthog.com',
    supabaseUrl: null,
    supabaseKey: null,
  });
});

test('a release build reads the file and ignores the environment', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'service-config-')), 'service-config.json');
  fs.writeFileSync(file, JSON.stringify({ posthogKey: 'phc_x', supabaseUrl: 'https://x.supabase.co', supabaseKey: 'pk' }));
  process.env.BEAMLYNX_SUPABASE_URL = 'https://dev.supabase.co';
  const config = loadServiceConfig(true, file);
  assert.equal(config.posthogKey, 'phc_x');
  assert.equal(config.supabaseUrl, 'https://x.supabase.co');
});

test('a dev build may set them through the environment', () => {
  process.env.BEAMLYNX_POSTHOG_KEY = 'phc_dev';
  assert.equal(loadServiceConfig(false, missing).posthogKey, 'phc_dev');
  assert.equal(loadServiceConfig(true, missing).posthogKey, null);
});
