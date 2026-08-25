// Regression test for a deadlock that took down every database-backed
// request in the app while leaving it looking healthy.
//
// src/main/server-process.ts spawns the bundled pine-server with
// `stdio: ['ignore', 'pipe', 'pipe']`. A piped stream nothing reads fills
// its OS buffer (~64KB) and then every write from the child blocks FOREVER.
// pine-lang wrote to stdout from inside its query path, so a full stdout
// buffer permanently deadlocked its entire database layer -- 17 server
// threads were found parked in StreamEncoder.write -- while /api/v1/build
// kept answering in 2ms because it reads an in-memory index and never
// prints. The app therefore looked fine while no query ever completed.
//
// Two tests here: the first proves the failure mode is real and that
// draining is what prevents it; the second asserts server-process.ts
// actually drains both streams, since that is the file that has to keep
// doing so.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Writes 2MB, comfortably past any pipe buffer (Linux defaults to 64KB).
//
// fs.writeSync, not console.log, and that distinction is the whole test:
// console.log on a pipe queues in Node's own userspace buffer and
// process.exit then truncates it, so the child exits happily and proves
// nothing. A synchronous write blocks in the kernel exactly the way the
// JVM's blocking write() does in the real bug -- verified before relying on
// it here.
const CHILD =
  'const fs=require("fs");const b=Buffer.alloc(1024,120);for(let i=0;i<2048;i++)fs.writeSync(1,b);';

function runChild({ drainStdout }) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['-e', CHILD], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.on('data', () => {});
    if (drainStdout) child.stdout.on('data', () => {});
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve('blocked');
    }, 4000);
    child.on('exit', () => {
      clearTimeout(timer);
      resolve('exited');
    });
  });
}

test('a child writing to an undrained stdout pipe blocks forever', async () => {
  assert.equal(
    await runChild({ drainStdout: false }),
    'blocked',
    'If this ever reports "exited", the premise changed -- but do not stop draining on that basis; ' +
      'the buffer size is a platform detail, not a guarantee.',
  );
});

test('draining stdout lets the same child run to completion', async () => {
  assert.equal(await runChild({ drainStdout: true }), 'exited');
});

test('server-process.ts drains BOTH stdout and stderr', () => {
  const source = fs
    .readFileSync(path.join(__dirname, '..', 'src', 'main', 'server-process.ts'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  assert.match(
    source,
    /child\.stdout\?\.on\(\s*['"]data['"]/,
    'server-process.ts must attach a data listener to the pine-server child\'s stdout. Without one the pipe ' +
      'fills and the server deadlocks on its next write -- see this file\'s header.',
  );
  assert.match(source, /child\.stderr\?\.on\(\s*['"]data['"]/, 'stderr must stay drained too.');
});
