// The bundled server's start-up. Runs against dist/ (see format.test.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isPineServerProcess, waitForReadyOrExit } = require('../dist/main/child-watch.js');

const never = new Promise(() => {});

test('a server that exits while starting is reported at once, with what it printed', { skip: process.platform === 'win32' }, async () => {
  const child = spawn('sh', ['-c', 'echo boom >&2; exit 3'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stderr.on('data', d => (output += d));
  const started = Date.now();
  await assert.rejects(waitForReadyOrExit(child, never, () => output), err => {
    assert.match(err.message, /exit code 3/);
    assert.match(err.message, /boom/);
    return true;
  });
  assert.ok(Date.now() - started < 2000);
});

test('a binary that cannot be started is an error, not an uncaught exception', async () => {
  const child = spawn(path.join(os.tmpdir(), 'no-such-pine-server-binary'), []);
  await assert.rejects(waitForReadyOrExit(child, never, () => ''), /couldn't be started/);
});

test('readiness wins when it comes first', { skip: process.platform === 'win32' }, async () => {
  const child = spawn('sleep', ['5']);
  try {
    assert.equal(await waitForReadyOrExit(child, Promise.resolve('ready'), () => ''), 'ready');
  } finally {
    child.kill();
  }
});

test('isPineServerProcess tells a pine server from an unrelated process with a reused PID', { skip: process.platform === 'win32' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pine-pid-'));
  const fake = path.join(dir, 'pine-server');
  fs.copyFileSync(fs.realpathSync('/bin/sleep'), fake);
  fs.chmodSync(fake, 0o755);
  const pine = spawn(fake, ['5']);
  const other = spawn('sleep', ['5']);
  await new Promise(r => setTimeout(r, 200));
  try {
    assert.equal(isPineServerProcess(pine.pid), true);
    assert.equal(isPineServerProcess(other.pid), false);
    assert.equal(isPineServerProcess(2 ** 22 + 12345), false);
  } finally {
    pine.kill();
    other.kill();
  }
});
