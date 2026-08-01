import { ChildProcess, spawn } from 'child_process';
import { app } from 'electron';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as path from 'path';

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

// Packaged layout: resources/server/pine-server/{bin,lib}/... staged by
// scripts/stage-server.sh from pine-lang/desktop/build/app-image.
function getServerDir(): string {
  return path.join(__dirname, '..', '..', 'resources', 'server', 'pine-server');
}

function getServerBinaryPath(): string {
  const binName = process.platform === 'win32' ? 'pine-server.exe' : 'pine-server';
  return path.join(getServerDir(), 'bin', binName);
}

function getExpectedVersion(): string {
  const versionFile = path.join(getServerDir(), '..', 'VERSION');
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

  const child = spawn(binaryPath, [], {
    cwd: getServerDir(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (child.pid) {
    fs.writeFileSync(getPidFilePath(), String(child.pid));
  }

  let stopping = false;
  let stderrTail = '';
  let unexpectedExitCb: ((info: UnexpectedExitInfo) => void) | undefined;

  child.stderr?.on('data', chunk => {
    stderrTail = (stderrTail + chunk.toString()).slice(-4000);
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
