// Knowing when the bundled pine server is ready to answer. Kept free of
// electron imports so the tests can require it in plain Node.
//
// Two signals, whichever comes first:
//
// - The server prints `pine-server ready <version>` on stdout once Jetty is
//   listening. This is the fast one: it arrives the moment the server is up.
//   pine-lang releases before this line existed don't print it.
// - The desktop asks the API every 50 ms until it answers. This works with
//   every pine-lang release, and is the fallback when the line never comes.
//
// Both give the server's version, which startServer() checks against the
// version this build bundles.
import { ChildProcess } from 'child_process';
import * as http from 'http';
import { waitForReadyOrExit } from './child-watch';

export const READY_POLL_INTERVAL_MS = 50;

// Matched against each whole line of the server's stdout.
const READY_LINE = /^pine-server ready (\S+)/;

export type ServerReady = { version: string; via: 'line' | 'poll' };

type Cancellable<T> = { ready: Promise<T>; cancel: () => void };

/**
 * Watches stdout for the ready line. Feed it every stdout chunk; a line can
 * arrive split across chunks, so it keeps the unfinished end of the last one.
 * Never settles if the line doesn't come.
 */
export function watchForReadyLine(): { feed: (chunk: string) => void; ready: Promise<{ version: string }> } {
  let pending = '';
  let found = false;
  let resolve!: (value: { version: string }) => void;
  const ready = new Promise<{ version: string }>(r => (resolve = r));
  const feed = (chunk: string) => {
    if (found) return;
    const lines = (pending + chunk).split('\n');
    // The last piece has no newline yet. Capped, so output with no newlines
    // at all can't grow it without bound.
    pending = lines.pop()!.slice(-1000);
    for (const line of lines) {
      const match = READY_LINE.exec(line);
      if (match) {
        found = true;
        resolve({ version: match[1] });
        return;
      }
    }
  };
  return { feed, ready };
}

/**
 * Asks /api/v1/connections until it answers with a version, or `timeoutMs`
 * passes. Cancel it once readiness is known some other way, so it stops
 * sending requests.
 */
export function pollReady(
  port: number,
  token: string,
  timeoutMs: number,
  timeoutHint = '',
  intervalMs = READY_POLL_INTERVAL_MS,
): Cancellable<{ version: string }> {
  const deadline = Date.now() + timeoutMs;
  let cancelled = false;
  let timer: NodeJS.Timeout | undefined;
  let request: http.ClientRequest | undefined;
  const ready = new Promise<{ version: string }>((resolve, reject) => {
    const retryOrFail = () => {
      if (cancelled) return;
      if (Date.now() > deadline) {
        reject(new Error(`pine-server did not become ready on port ${port} within ${timeoutMs}ms.${timeoutHint}`));
        return;
      }
      timer = setTimeout(attempt, intervalMs);
    };
    const attempt = () => {
      if (cancelled) return;
      const req = http.get(
        {
          host: '127.0.0.1',
          port,
          path: '/api/v1/connections',
          timeout: 1000,
          headers: { Authorization: `Bearer ${token}` },
        },
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
      request = req;
      req.on('error', retryOrFail);
      req.on('timeout', () => {
        req.destroy();
        retryOrFail();
      });
    };
    attempt();
  });
  const cancel = () => {
    cancelled = true;
    clearTimeout(timer);
    request?.destroy();
  };
  return { ready, cancel };
}

/**
 * Waits for whichever readiness signal comes first. Fails at once if the
 * child can't be started or exits first (see waitForReadyOrExit), and after
 * `timeoutMs` if neither signal comes. The poll is stopped either way.
 */
export async function waitForServerReady(
  child: ChildProcess,
  readyLine: Promise<{ version: string }>,
  options: { port: number; token: string; timeoutMs: number; timeoutHint?: string; output: () => string },
): Promise<ServerReady> {
  const poll = pollReady(options.port, options.token, options.timeoutMs, options.timeoutHint);
  try {
    return await waitForReadyOrExit<ServerReady>(
      child,
      Promise.race([
        readyLine.then(({ version }) => ({ version, via: 'line' as const })),
        poll.ready.then(({ version }) => ({ version, via: 'poll' as const })),
      ]),
      options.output,
    );
  } finally {
    poll.cancel();
  }
}
