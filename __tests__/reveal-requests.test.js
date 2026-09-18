// Tests for src/main/mcp/reveal-requests.ts -- the in-memory queue behind
// the MCP request_reveal/check_reveal tool pair. See that file's own
// top-of-file comment for the full flow this backs.
//
// Runs against dist/, not src/ (this repo's Node is v20, which has no
// TypeScript stripping -- `npm test` builds first). Same require.cache
// electron stub as credential-store.access-policy.test.js -- reveal-requests.ts
// only touches electron for ipcMain.handle in registerRevealIpc, which this
// stub no-ops.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist', 'main', 'mcp', 'reveal-requests.js');
assert.ok(fs.existsSync(DIST), 'dist/main/mcp/reveal-requests.js is missing -- run `npm run build` first (npm test does).');

const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: { ipcMain: { handle: () => {} } },
};

const { createRevealRequest, getRevealRequest, resolveRevealRequest, waitForRevealRequest } = require(DIST);

test('createRevealRequest starts pending, with no outcome yet', () => {
  const request = createRevealRequest('conn-1', 'user | select: email', 'need to verify a support ticket');
  assert.equal(request.status, 'pending');
  assert.equal(request.outcome, undefined);
  assert.equal(request.profileId, 'conn-1');
  assert.equal(request.expression, 'user | select: email');
  assert.equal(request.reason, 'need to verify a support ticket');
});

test('reason is optional', () => {
  const request = createRevealRequest('conn-1', 'user | select: email');
  assert.equal(request.reason, undefined);
});

test('getRevealRequest returns undefined for an id that was never created', () => {
  assert.equal(getRevealRequest('does-not-exist'), undefined);
});

test('resolveRevealRequest(ok: true) moves the request to revealed and stores the outcome verbatim', () => {
  const request = createRevealRequest('conn-1', 'user | select: email');
  const outcome = { ok: true, expression: 'user | select: email', columns: [], rows: [['email'], ['real@example.com']] };
  const resolved = resolveRevealRequest(request.id, outcome);
  assert.equal(resolved.status, 'revealed');
  assert.deepEqual(resolved.outcome, outcome);
  assert.deepEqual(getRevealRequest(request.id), resolved);
});

test('resolveRevealRequest(ok: false) moves the request to declined and keeps any comment', () => {
  const request = createRevealRequest('conn-1', 'user | select: ssn');
  const resolved = resolveRevealRequest(request.id, { ok: false, comment: 'not for agents' });
  assert.equal(resolved.status, 'declined');
  assert.deepEqual(resolved.outcome, { ok: false, comment: 'not for agents' });
});

test('resolveRevealRequest(ok: false) allows an absent comment', () => {
  const request = createRevealRequest('conn-1', 'user | select: ssn');
  const resolved = resolveRevealRequest(request.id, { ok: false });
  assert.equal(resolved.status, 'declined');
  assert.deepEqual(resolved.outcome, { ok: false });
});

test('resolveRevealRequest returns null for an id that does not exist, rather than throwing', () => {
  assert.equal(resolveRevealRequest('does-not-exist', { ok: false }), null);
});

test('resolving twice overwrites the earlier outcome -- there is nothing to guard against here, only one caller (the owner\'s own tab) ever resolves a given request', () => {
  const request = createRevealRequest('conn-1', 'user | select: email');
  resolveRevealRequest(request.id, { ok: false, comment: 'first pass' });
  const resolved = resolveRevealRequest(request.id, {
    ok: true,
    expression: 'user | select: email',
    columns: [],
    rows: [],
  });
  assert.equal(resolved.status, 'revealed');
});

test('waitForRevealRequest resolves immediately for an id that does not exist', async () => {
  const result = await waitForRevealRequest('does-not-exist', 1000);
  assert.equal(result, undefined);
});

test('waitForRevealRequest resolves immediately for a request that is already resolved', async () => {
  const request = createRevealRequest('conn-1', 'user | select: email');
  resolveRevealRequest(request.id, { ok: false, comment: 'already declined' });
  const start = Date.now();
  const result = await waitForRevealRequest(request.id, 1000);
  assert.equal(result.status, 'declined');
  // Not a hard latency assertion (CI machines vary) -- just confirms this
  // took the immediate-return path, not the timeout path.
  assert.ok(Date.now() - start < 1000);
});

test('waitForRevealRequest wakes up as soon as the request resolves, without waiting for the timeout', async () => {
  const request = createRevealRequest('conn-1', 'user | select: email');
  const waiting = waitForRevealRequest(request.id, 5000);
  setTimeout(() => resolveRevealRequest(request.id, { ok: true, expression: 'user | select: email', columns: [], rows: [] }), 20);
  const start = Date.now();
  const result = await waiting;
  assert.equal(result.status, 'revealed');
  assert.ok(Date.now() - start < 5000, 'should have woken on resolve, not sat out the full 5s timeout');
});

test('waitForRevealRequest returns the still-pending request once the timeout elapses with no resolution', async () => {
  const request = createRevealRequest('conn-1', 'user | select: email');
  const result = await waitForRevealRequest(request.id, 20);
  assert.equal(result.status, 'pending');
});

test('waitForRevealRequest supports several concurrent waiters on the same id, all woken by one resolve', async () => {
  const request = createRevealRequest('conn-1', 'user | select: email');
  const waiters = [
    waitForRevealRequest(request.id, 5000),
    waitForRevealRequest(request.id, 5000),
    waitForRevealRequest(request.id, 5000),
  ];
  setTimeout(() => resolveRevealRequest(request.id, { ok: false, comment: 'declined for everyone waiting' }), 20);
  const results = await Promise.all(waiters);
  for (const result of results) {
    assert.equal(result.status, 'declined');
  }
});
