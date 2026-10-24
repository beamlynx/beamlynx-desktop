// The web server that receives the browser at the end of a sign-in. It runs
// only while a sign-in is in progress. This is the "loopback redirect" that
// RFC 8252 recommends for desktop apps, and it works the same on every OS and
// packaging, unlike the beamlynx:// scheme (an AppImage never registers it).
//
// Supabase accepts a redirect to any loopback IP address on any port, so the
// port is whatever is free. 127.0.0.1, not localhost: localhost is a name,
// not an IP address, and would have to match Supabase's allowlist.
//
// It accepts one request, on CALLBACK_PATH, then closes. A request that
// didn't come from a sign-in this app started can't finish it anyway: only
// this app holds the PKCE verifier the code is exchanged with.
//
// This file has no Electron import, so the tests can run it on plain Node.
import * as http from 'http';
import type { AddressInfo } from 'net';

export const CALLBACK_PATH = '/auth/callback';

// flowId is Supabase's sb_flow_id, which it adds to the redirect address to
// say which sign-in the code belongs to.
export type CallbackResult = { code: string; flowId?: string } | { error: string };

export type CallbackServer = {
  redirectUri: string;
  // Settles once: with the code, the provider's error, or a rejection when it
  // times out or is closed first.
  result: Promise<CallbackResult>;
  close(): void;
};

const page = (title: string, text: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Beamlynx</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#111;color:#eee}
main{text-align:center}h1{font-size:1.3rem;font-weight:600}p{color:#aaa}</style></head>
<body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;

export function startCallbackServer(timeoutMs = 5 * 60_000): Promise<CallbackServer> {
  return new Promise((resolve, reject) => {
    let settle: { resolve: (r: CallbackResult) => void; reject: (e: Error) => void };
    const result = new Promise<CallbackResult>((res, rej) => (settle = { resolve: res, reject: rej }));
    let done = false;
    // A sign-in that fails before anyone waits on the result (say, the
    // browser can't be opened) must not leave an unhandled rejection.
    result.catch(() => {});

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (done || req.method !== 'GET' || url.pathname !== CALLBACK_PATH) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error_description') || url.searchParams.get('error');
      if (!code && !error) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing code');
        return;
      }
      done = true;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' });
      res.end(
        code
          ? page("You're signed in to Beamlynx", 'You can close this tab and go back to the app.')
          : page("Beamlynx couldn't sign you in", 'Go back to the app to try again.'),
      );
      finish();
      const flowId = url.searchParams.get('sb_flow_id');
      settle.resolve(code ? { code, ...(flowId ? { flowId } : {}) } : { error: error! });
    });

    const timer = setTimeout(() => {
      finish();
      settle.reject(new Error('Sign-in timed out'));
    }, timeoutMs);

    function finish() {
      done = true;
      clearTimeout(timer);
      server.close();
      server.closeAllConnections?.();
    }

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
        result,
        close: () => {
          if (done) return;
          finish();
          settle.reject(new Error('Sign-in cancelled'));
        },
      });
    });
  });
}
