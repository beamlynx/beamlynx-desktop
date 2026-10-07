// The MCP control plane listens on loopback, so any program on the machine
// can reach it, and a web page can send it a request without being able to
// read the answer. Only the --mcp relay, which reads this launch's token from
// a file, may use it. Runs against dist/ (see format.test.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { authorizeControlPlaneRequest } = require('../dist/main/mcp/control-plane-auth.js');

const TOKEN = 'launch-token';

test('the relay, sending the token and no Origin, is let through', () => {
  assert.equal(authorizeControlPlaneRequest({ authorization: `Bearer ${TOKEN}` }, TOKEN), null);
});

test('a request without the token is refused with 401', () => {
  assert.deepEqual(authorizeControlPlaneRequest({}, TOKEN)?.status, 401);
  assert.deepEqual(authorizeControlPlaneRequest({ authorization: 'Bearer wrong' }, TOKEN)?.status, 401);
});

test('a request from a web page is refused with 403, even with the right token', () => {
  const refusal = authorizeControlPlaneRequest(
    { origin: 'https://evil.example', authorization: `Bearer ${TOKEN}` },
    TOKEN,
  );
  assert.equal(refusal?.status, 403);
  assert.equal(authorizeControlPlaneRequest({ origin: 'null' }, TOKEN)?.status, 403);
});
