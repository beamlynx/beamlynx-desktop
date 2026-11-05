// Knowing when the bundled server is ready: the line it prints on stdout, or
// the HTTP poll when it prints nothing. Runs against dist/ (see format.test.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { watchForReadyLine, waitForServerReady } = require('../dist/main/server-ready.js');

// A stand-in server process: runs `script` in Node and stays alive until killed.
function fakeServer(script) {
  const child = spawn(process.execPath, ['-e', `${script}; setInterval(() => {}, 1000);`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const readyLine = watchForReadyLine();
  let output = '';
  child.stdout.on('data', chunk => {
    output += chunk;
    readyLine.feed(String(chunk));
  });
  child.stderr.on('data', chunk => (output += chunk));
  return { child, readyLine, output: () => output };
}

// A port nothing listens on, so the poll keeps failing.
async function closedPort() {
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('the ready line is found across chunks, after other output, with Windows line endings', async () => {
  const { feed, ready } = watchForReadyLine();
  feed('Starting pine server...\r\nnot pine-server ready 1.0.0\r\npine-server rea');
  feed('dy 0.54.0\r\n');
  assert.deepEqual(await ready, { version: '0.54.0' });
});

test('a line that has not ended yet does not count', async () => {
  const { feed, ready } = watchForReadyLine();
  feed('pine-server ready 0.54');
  const result = await Promise.race([ready, new Promise(resolve => setTimeout(() => resolve('waiting'), 50))]);
  assert.equal(result, 'waiting');
  feed('.1\n');
  assert.deepEqual(await ready, { version: '0.54.1' });
});

test('a server that prints the ready line is ready at once, with no HTTP answer', async () => {
  const { child, readyLine, output } = fakeServer(
    `process.stdout.write('booting\\npine-server '); setTimeout(() => process.stdout.write('ready 9.9.9\\n'), 100)`,
  );
  try {
    const started = Date.now();
    const result = await waitForServerReady(child, readyLine.ready, {
      port: await closedPort(),
      token: 't',
      timeoutMs: 5000,
      output,
    });
    // The version comes from the line, so startServer() checks it against the
    // bundled one the same way it checks the poll's.
    assert.deepEqual(result, { version: '9.9.9', via: 'line' });
    assert.ok(Date.now() - started < 2000);
  } finally {
    child.kill('SIGKILL');
  }
});

test('a server that never prints the line is found by the poll', async () => {
  let requests = 0;
  const api = http.createServer((req, res) => {
    requests++;
    assert.equal(req.headers.authorization, 'Bearer secret');
    res.end(JSON.stringify({ result: { version: '0.53.1' } }));
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const { child, readyLine, output } = fakeServer(`console.log('an older pine-lang, no ready line')`);
  try {
    const result = await waitForServerReady(child, readyLine.ready, {
      port: api.address().port,
      token: 'secret',
      timeoutMs: 5000,
      output,
    });
    assert.deepEqual(result, { version: '0.53.1', via: 'poll' });
    // The poll stops once the server is ready.
    const after = requests;
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(requests, after);
  } finally {
    child.kill('SIGKILL');
    api.close();
  }
});

test('the poll asks every 50 ms, not every 250 ms', async () => {
  let requests = 0;
  const api = http.createServer((req, res) => {
    requests++;
    res.statusCode = 503;
    res.end('starting');
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const { child, readyLine, output } = fakeServer(`setTimeout(() => process.exit(1), 600)`);
  try {
    await assert.rejects(
      waitForServerReady(child, readyLine.ready, { port: api.address().port, token: 't', timeoutMs: 5000, output }),
      /stopped while starting/,
    );
    // ~600 ms at 50 ms apart is ~10 requests; at 250 ms it would be 3.
    assert.ok(requests >= 6, `only ${requests} requests in 600 ms`);
    // And the poll stops once the server has gone.
    const after = requests;
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(requests, after);
  } finally {
    api.close();
  }
});

test('with neither signal, it gives up after the timeout', async () => {
  const { child, readyLine, output } = fakeServer('');
  try {
    await assert.rejects(
      waitForServerReady(child, readyLine.ready, {
        port: await closedPort(),
        token: 't',
        timeoutMs: 300,
        timeoutHint: ' (hint)',
        output,
      }),
      /did not become ready on port \d+ within 300ms\. \(hint\)/,
    );
  } finally {
    child.kill('SIGKILL');
  }
});
