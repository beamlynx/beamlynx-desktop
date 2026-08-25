import { ChildProcess, spawn } from 'child_process';
import { app } from 'electron';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as path from 'path';
import { getResourcesRoot } from './resources';

const PINE_PORT = 33333;
const READY_TIMEOUT_MS = 15000;
const READY_POLL_INTERVAL_MS = 250;
const KILL_GRACE_PERIOD_MS = 5000;

// A SIGKILL (force-quit, crash, task-killed) can't be intercepted, so
// before-quit/child.on('exit') never run and the bundled server is left
// orphaned -- confirmed empirically, not a hypothetical. The standard fix:
// remember the last-spawned PID on disk and reap it on the *next* launch,
// before starting a new one.
function getPidFilePath(): string {
  return path.join(app.getPath('userData'), 'pine-server.pid');
}

function killStaleServerIfAny(): void {
  const pidFile = getPidFilePath();
  if (!fs.existsSync(pidFile)) return;
  const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
  fs.rmSync(pidFile, { force: true });
  if (!pid || Number.isNaN(pid)) return;
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // ESRCH (already gone) is the expected common case -- nothing to do.
  }
}

export class ServerProcessError extends Error {}

export type UnexpectedExitInfo = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderrTail: string;
};

export type ServerHandle = {
  process: ChildProcess;
  stop: () => Promise<void>;
  onUnexpectedExit: (cb: (info: UnexpectedExitInfo) => void) => void;
};

// Packaged layout: resources/server/ -- staged by scripts/stage-server.sh
// from pine-lang/desktop/build/app-image, plus a VERSION file it writes
// alongside. jpackage's app-image layout differs by OS, not just by binary
// extension:
//   Linux:   pine-server/bin/pine-server
//   Windows: pine-server/pine-server.exe          (no bin/ subdir)
//   macOS:   pine-server.app/Contents/MacOS/pine-server  (an app bundle)
function getServerRoot(): string {
  return path.join(getResourcesRoot(), 'server');
}

function getServerBinaryPath(): string {
  const root = getServerRoot();
  if (process.platform === 'darwin') {
    return path.join(root, 'pine-server.app', 'Contents', 'MacOS', 'pine-server');
  }
  if (process.platform === 'win32') {
    return path.join(root, 'pine-server', 'pine-server.exe');
  }
  return path.join(root, 'pine-server', 'bin', 'pine-server');
}

function getExpectedVersion(): string {
  const versionFile = path.join(getServerRoot(), 'VERSION');
  if (!fs.existsSync(versionFile)) {
    throw new ServerProcessError(`Expected bundled server version file not found at ${versionFile}`);
  }
  return fs.readFileSync(versionFile, 'utf-8').trim();
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

// -main returns immediately (:join? false in pine.core), so a live process
// tells us nothing about Jetty actually being up -- poll the API instead.
function pollReady(port: number, timeoutMs: number): Promise<{ version: string }> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const retryOrFail = () => {
      if (Date.now() > deadline) {
        reject(new ServerProcessError(`pine-server did not become ready within ${timeoutMs}ms`));
        return;
      }
      setTimeout(attempt, READY_POLL_INTERVAL_MS);
    };
    const attempt = () => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/api/v1/connections', timeout: 1000 },
        res => {
          let body = '';
          res.on('data', chunk => (body += chunk));
          res.on('end', () => {
            try {
              const version = JSON.parse(body)?.result?.version;
              if (version) {
                resolve({ version });
                return;
              }
            } catch {
              // not ready yet, or not valid JSON -- retry
            }
            retryOrFail();
          });
        },
      );
      req.on('error', retryOrFail);
      req.on('timeout', () => {
        req.destroy();
        retryOrFail();
      });
    };
    attempt();
  });
}

export async function startServer(): Promise<ServerHandle> {
  const binaryPath = getServerBinaryPath();
  if (!fs.existsSync(binaryPath)) {
    throw new ServerProcessError(`Bundled pine-server binary not found at ${binaryPath}`);
  }

  killStaleServerIfAny();

  if (await isPortInUse(PINE_PORT)) {
    throw new ServerProcessError(
      `Port ${PINE_PORT} is already in use. If you have a "docker run ... ahmadnazir/pine" container ` +
        `running, stop it and relaunch beamlynx-desktop.`,
    );
  }

  // cwd no longer matters for correctness -- pine-lang loads its grammar
  // from the classpath, not a cwd-relative path -- but the binary's own
  // directory is still the sensible default.
  const child = spawn(binaryPath, [], {
    cwd: path.dirname(binaryPath),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (child.pid) {
    fs.writeFileSync(getPidFilePath(), String(child.pid));
  }

  let stopping = false;
  let stderrTail = '';
  let unexpectedExitCb: ((info: UnexpectedExitInfo) => void) | undefined;

  // BOTH pipes must be drained, always. A piped stdio stream nothing reads
  // fills its OS buffer (~64KB) and then every write from the child blocks
  // FOREVER -- and pine-lang writes to stdout from inside `run-query`, so a
  // full stdout buffer deadlocks its entire database layer while leaving
  // endpoints that don't touch the database (notably /api/v1/build, which
  // answers from an in-memory index) working normally.
  //
  // That is not hypothetical: it happened, and the failure is deeply
  // misleading. A thread dump showed 17 pine-lang threads parked in
  // StreamEncoder.write inside pine.db.postgres/run-query, /api/v1/build
  // still answering in 2ms, and the UI showing *build* requests as
  // "pending" -- because the renderer's hung /connection/stats polls had
  // consumed all 6 of Chromium's per-host sockets, so new requests queued
  // in the browser and never reached the server at all.
  //
  // pine-lang's per-query prints were removed on its side too, but the
  // drain is the load-bearing fix: it makes any future print from the
  // server harmless instead of fatal.
  const keepTail = (tail: string, chunk: unknown) => (tail + String(chunk)).slice(-4000);

  child.stderr?.on('data', chunk => {
    stderrTail = keepTail(stderrTail, chunk);
  });

  // Folded into the same tail as stderr rather than kept separately: this
  // exists to keep the pipe empty and to give an unexpected-exit report
  // something to show, and pine-lang's startup diagnostics go to stdout.
  child.stdout?.on('data', chunk => {
    stderrTail = keepTail(stderrTail, chunk);
  });

  child.on('exit', (code, signal) => {
    if (!stopping) {
      unexpectedExitCb?.({ code, signal, stderrTail });
    }
  });

  const stop = async () => {
    stopping = true;
    fs.rmSync(getPidFilePath(), { force: true });
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const exited = await Promise.race([
      new Promise<boolean>(resolve => child.once('exit', () => resolve(true))),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), KILL_GRACE_PERIOD_MS)),
    ]);
    if (!exited) {
      child.kill('SIGKILL');
    }
  };

  const handle: ServerHandle = {
    process: child,
    stop,
    onUnexpectedExit: cb => {
      unexpectedExitCb = cb;
    },
  };

  try {
    const expectedVersion = getExpectedVersion();
    const { version } = await pollReady(PINE_PORT, READY_TIMEOUT_MS);
    if (version !== expectedVersion) {
      await stop();
      // A build-integrity tripwire, not something a correctly assembled
      // release should ever hit -- the whole point of bundling is that UI
      // and server versions can't drift apart.
      throw new ServerProcessError(
        `Bundled pine-server reports version ${version}, but this build expects ${expectedVersion}. ` +
          `Refusing to continue with a mismatched bundle.`,
      );
    }
  } catch (err) {
    await stop();
    throw err;
  }

  return handle;
}
