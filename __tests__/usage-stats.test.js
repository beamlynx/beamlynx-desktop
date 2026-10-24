// Tests for anonymous usage stats (src/main/usage-stats.ts): what is sent,
// when, and under which ID. Runs the compiled module with an in-memory meta
// store and a fake PostHog client.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist', 'main', 'usage-stats.js');
assert.ok(fs.existsSync(DIST), 'dist/main/usage-stats.js is missing -- run `npm run build` first (npm test does).');
const { createUsageStats, META } = require(DIST);

const CONTEXT = { appVersion: '1.2.3', os: 'linux', arch: 'x64' };

function setup({ client = true, meta = {} } = {}) {
  const store = new Map(Object.entries(meta));
  const metaStore = {
    getMeta: k => (store.has(k) ? store.get(k) : null),
    setMeta: (k, v) => (v === null ? store.delete(k) : store.set(k, v)),
  };
  const sent = [];
  const fake = {
    capture: m => sent.push({ type: 'capture', ...m }),
    alias: m => sent.push({ type: 'alias', ...m }),
    identify: m => sent.push({ type: 'identify', ...m }),
    shutdown: async () => {},
  };
  return { stats: createUsageStats(metaStore, client ? fake : null, CONTEXT), sent, store };
}

test('nothing is sent before the first-run choice, and app_opened waits for it', () => {
  const { stats, sent } = setup();
  stats.appOpened();
  stats.capture('query_run', { source: 'user', language: 'pine' });
  assert.equal(sent.length, 0);

  stats.setOnboarding('skipped');
  assert.deepEqual(sent.map(e => e.event), ['app_opened']);
});

test('turning usage stats off on the first-run screen means nothing is ever sent', () => {
  const { stats, sent } = setup();
  stats.appOpened();
  stats.setEnabled(false);
  stats.setOnboarding('skipped');
  stats.capture('query_run', { source: 'user', language: 'sql' });
  stats.identify({ id: 'user-1', email: 'a@example.com' });
  assert.equal(sent.length, 0);
});

test('only known events and properties are sent, with the app context', () => {
  const { stats, sent, store } = setup({ meta: { [META.onboarding]: 'skipped' } });
  stats.capture('query_run', { source: 'user', language: 'pine', expression: 'user | limit: 1' });
  stats.capture('query_run', { source: 'nobody', language: 'pine' });
  stats.capture('connection_added', { database_type: 'db.example.com' });
  stats.capture('table_opened', { table: 'secrets' });

  assert.deepEqual(
    sent.map(e => [e.event, e.properties]),
    [
      ['query_run', { source: 'user', language: 'pine', ...appContext() }],
      ['query_run', { language: 'pine', ...appContext() }],
      ['connection_added', appContext()],
    ],
  );
  const installId = store.get(META.installId);
  assert.ok(installId);
  assert.ok(sent.every(e => e.distinctId === installId));
});

test('signing in joins the install to the person, and later events use the person', () => {
  const { stats, sent, store } = setup({ meta: { [META.onboarding]: 'skipped' } });
  stats.capture('app_opened');
  const installId = store.get(META.installId);

  stats.identify({ id: 'user-1', email: 'a@example.com', name: 'Anna' });
  stats.capture('query_run', { source: 'agent', language: 'sql' });

  assert.deepEqual(sent[1], { type: 'alias', distinctId: 'user-1', alias: installId });
  assert.deepEqual(sent[2], { type: 'identify', distinctId: 'user-1', properties: { email: 'a@example.com', name: 'Anna' } });
  assert.equal(sent[3].distinctId, 'user-1');
});

test('signing out starts a new install ID, so the next person is not counted as the first', () => {
  const { stats, sent, store } = setup({ meta: { [META.onboarding]: 'signed-in' } });
  stats.identify({ id: 'user-1' });
  const firstInstall = sent.find(e => e.type === 'alias').alias;

  stats.forget();
  stats.capture('app_opened');
  const after = sent[sent.length - 1].distinctId;
  assert.notEqual(after, 'user-1');
  assert.notEqual(after, firstInstall);
  assert.equal(store.get(META.userId), undefined);
});

test('without a client, nothing breaks and the choices are still kept', () => {
  const { stats, store } = setup({ client: false });
  stats.appOpened();
  stats.setOnboarding('signed-in');
  stats.identify({ id: 'user-1' });
  stats.capture('app_opened');
  assert.equal(stats.onboarding(), 'signed-in');
  assert.equal(store.get(META.userId), 'user-1');
});

function appContext() {
  return { app_version: '1.2.3', os: 'linux', arch: 'x64' };
}
