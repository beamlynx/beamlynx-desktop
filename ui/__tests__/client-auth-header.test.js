// In the desktop app every request to the bundled Pine server carries the
// launch token the app made (beamlynx-desktop's launch-secrets.ts); the
// server refuses requests without it. These call the real HttpClient with
// fetch stubbed to record what was sent.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HttpClient, ServerRejectedError } = require('../store/client.ts');

function stubFetch(status = 200, body = { result: { version: '0.48.1' } }) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: status < 400, status, statusText: '', json: async () => body };
  };
  return { calls, restore: () => (global.fetch = original) };
}

function withWindow(beamlynxDesktop, fn) {
  const original = global.window;
  global.window = { location: { hostname: '' }, beamlynxDesktop };
  return Promise.resolve(fn()).finally(() => (global.window = original));
}

test('with a desktop token, GET, POST and DELETE all carry it as a bearer token', () =>
  withWindow({ pineServerUrl: 'http://localhost:43333', pineServerToken: 't0ken' }, async () => {
    const { calls, restore } = stubFetch();
    try {
      const client = new HttpClient();
      await client.get('connection');
      await client.eval(['company']);
      await client.deleteConnection('c1');
      assert.deepEqual(calls.map(c => c.options.method), ['GET', 'POST', 'DELETE']);
      for (const { url, options } of calls) {
        assert.ok(url.startsWith('http://localhost:43333/api/v1/'), url);
        assert.equal(options.headers.Authorization, 'Bearer t0ken');
      }
    } finally {
      restore();
    }
  }));

test('without a token (the web build), no Authorization header is sent', () =>
  withWindow(undefined, async () => {
    const { calls, restore } = stubFetch();
    try {
      await new HttpClient().get('connection');
      assert.equal(calls[0].options.headers.Authorization, undefined);
    } finally {
      restore();
    }
  }));

test('a 401 surfaces as ServerRejectedError, not as a missing server', () =>
  withWindow({ pineServerUrl: 'http://localhost:43333', pineServerToken: 'stale' }, async () => {
    const { restore } = stubFetch(401, { 'error-type': 'unauthorized', error: 'x' });
    try {
      await assert.rejects(new HttpClient().get('connection'), ServerRejectedError);
      await assert.rejects(new HttpClient().eval(['company']), ServerRejectedError);
    } finally {
      restore();
    }
  }));
