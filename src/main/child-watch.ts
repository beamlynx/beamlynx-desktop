// Watching the bundled server's process. Kept free of electron imports so the
// tests can require it in plain Node.
import { ChildProcess, execFileSync } from 'child_process';
import * as fs from 'fs';

/**
 * Waits for `ready`, but fails at once if the child process can't be started
 * or exits first.
 *
 * Without this, a JVM that died at boot (a missing library, a broken runtime,
 * a bad port) was only reported after the full readiness timeout, as "did not
 * become ready", and what it printed was never shown. A spawn failure
 * (EACCES, ENOENT) had no listener at all, so it became an uncaught exception
 * in the main process.
 */
export function waitForReadyOrExit<T>(child: ChildProcess, ready: Promise<T>, output: () => string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      child.off('error', onError);
      child.off('exit', onExit);
      fn();
    };
    const tail = () => {
      const text = output().trim();
      return text ? `\n\nIt printed:\n${text.slice(-2000)}` : '';
    };
    const onError = (err: Error) =>
      finish(() => reject(new Error(`The pine server couldn't be started: ${err.message}${tail()}`)));
    const onExit = (code: number | null, signal: NodeJS.Signals | null) =>
      finish(() =>
        reject(new Error(`The pine server stopped while starting (exit code ${code}, signal ${signal}).${tail()}`)),
      );
    child.once('error', onError);
    child.once('exit', onExit);
    ready.then(
      value => finish(() => resolve(value)),
      err => finish(() => reject(err)),
    );
  });
}

/**
 * Whether process `pid` is a pine server. Checked before killing the PID left
 * in the PID file by a previous run: after a reboot, or a long time, that
 * number can belong to an unrelated process. Unknown counts as no.
 */
export function isPineServerProcess(pid: number): boolean {
  try {
    if (process.platform === 'linux') {
      return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('pine-server');
    }
    if (process.platform === 'win32') {
      const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
      return out.toLowerCase().includes('pine-server');
    }
    const out = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
    return out.includes('pine-server');
  } catch {
    return false;
  }
}
