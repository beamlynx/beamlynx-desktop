// Tests for src/main/mcp/read-body.ts: both ends of the control plane read
// bodies through it. A character split across two chunks must come out
// whole -- decoding each chunk on its own turned it into "�".
//
// Runs against dist/ (npm test builds first).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PassThrough } = require('node:stream');

const { readUtf8Body, BodyTooLargeError } = require(path.join(__dirname, '..', 'dist', 'main', 'mcp', 'read-body.js'));

test('a character whose bytes straddle two chunks is decoded whole', async () => {
  const bytes = Buffer.from('{"name":"café → ü"}', 'utf-8');
  const split = bytes.indexOf(0xc3) + 1; // between the two bytes of "é"
  const stream = new PassThrough();
  const read = readUtf8Body(stream);
  stream.write(bytes.subarray(0, split));
  stream.write(bytes.subarray(split));
  stream.end();
  assert.equal(await read, '{"name":"café → ü"}');
});

test('an empty body is an empty string', async () => {
  const stream = new PassThrough();
  const read = readUtf8Body(stream);
  stream.end();
  assert.equal(await read, '');
});

test('a body past the limit is refused, counted in bytes', async () => {
  const stream = new PassThrough();
  const read = readUtf8Body(stream, 4);
  stream.write(Buffer.from('éé', 'utf-8')); // 4 bytes: fits
  stream.write(Buffer.from('é', 'utf-8'));
  stream.end();
  await assert.rejects(read, BodyTooLargeError);
});
