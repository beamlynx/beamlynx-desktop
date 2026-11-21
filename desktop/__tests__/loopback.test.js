// Tests for the sign-in callback server (src/main/loopback.ts): it takes one
// request on /auth/callback, on 127.0.0.1, and then stops listening.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist', 'main', 'loopback.js');
assert.ok(fs.existsSync(DIST), 'dist/main/loopback.js is missing -- run `npm run build` first (npm test does).');
const { startCallbackServer } = require(DIST);

test('the redirect address is on 127.0.0.1, and the code comes back once', async () => {
  const server = await startCallbackServer();
  assert.match(server.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);

  const wrongPath = await fetch(server.redirectUri.replace('/auth/callback', '/other?code=x'));
  assert.equal(wrongPath.status, 404);
  const noCode = await fetch(server.redirectUri);
  assert.equal(noCode.status, 400);

  const res = await fetch(`${server.redirectUri}?code=abc123`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /signed in/);
  assert.deepEqual(await server.result, { code: 'abc123' });

  await assert.rejects(fetch(`${server.redirectUri}?code=again`));
});

test("Supabase's flow ID comes back with the code", async () => {
  const server = await startCallbackServer();
  await fetch(`${server.redirectUri}?sb_flow_id=f1&code=abc`);
  assert.deepEqual(await server.result, { code: 'abc', flowId: 'f1' });
});

test("the provider's error is passed on", async () => {
  const server = await startCallbackServer();
  await fetch(`${server.redirectUri}?error=access_denied&error_description=The+user+said+no`);
  assert.deepEqual(await server.result, { error: 'The user said no' });
});

test('closing it cancels the sign-in and stops listening', async () => {
  const server = await startCallbackServer();
  server.close();
  await assert.rejects(server.result, /cancelled/);
  await assert.rejects(fetch(`${server.redirectUri}?code=late`));
});

test('it gives up after the timeout', async () => {
  const server = await startCallbackServer(50);
  await assert.rejects(server.result, /timed out/);
});

test('after a sign-in the page moves on to the given beamlynx.com page, never elsewhere', async () => {
  const next = 'https://beamlynx.com/signed-in?id=0b0e7c1a-5a8e-4a4f-9f53-1c2d3e4f5a6b';
  const server = await startCallbackServer(undefined, next);
  const page = await (await fetch(`${server.redirectUri}?code=abc`)).text();
  assert.ok(page.includes(`content="0;url=${next}"`));

  const evil = await startCallbackServer(undefined, 'javascript:alert(1)');
  assert.doesNotMatch(await (await fetch(`${evil.redirectUri}?code=abc`)).text(), /refresh/);

  const failed = await startCallbackServer(undefined, next);
  assert.doesNotMatch(await (await fetch(`${failed.redirectUri}?error=access_denied`)).text(), /refresh/);
});
