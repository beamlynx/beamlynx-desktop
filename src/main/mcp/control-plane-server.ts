// Runs inside the normal GUI process (started from index.ts's main(), once
// the window has loaded beamlynx-ui) -- NOT inside the --mcp relay process.
// This is what the --mcp process actually talks to: it enforces the MCP
// connection whitelist (the one place enforcement can't be bypassed by a
// hand-rolled client hitting this port directly, since the --mcp relay is
// just a thin proxy anyone could spawn) and drives real query execution
// through the renderer, so MCP-driven queries land in a real, visible tab
// instead of a parallel headless path. See
// beamlynx-plans/pending/2026-08-15-mcp-server-and-url-scheme.md.
import { BrowserWindow } from 'electron';
import * as http from 'http';
import { getMcpAccessStatus, listMcpEnabledConnections } from '../credential-store';
import { runInRenderer } from './render-bridge';
import { createRevealRequest, getRevealRequest } from './reveal-requests';

export const CONTROL_PLANE_PORT = 33334;

type StartControlPlaneServerOptions = {
  getMainWindow: () => BrowserWindow | null;
};

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

// Whitelist enforcement lives here, not in the --mcp relay: this is the one
// process boundary a hand-rolled client can't cross to bypass it (anyone on
// the machine could spawn `beamlynx --mcp` themselves and skip whatever
// checks lived there instead).
//
// Distinguishes *why* a connection isn't reachable rather than folding
// every case into one generic message: 'not-found'/'not-enabled' means it
// was never opted in to MCP at all, but 'no-active-policy' means it WAS
// properly set up -- mcpEnabled with a real, *named* policy assigned -- and
// that policy's last active rule was disabled afterward (see
// credential-store.ts's setAccessPolicyModuleEnabled, which deliberately
// doesn't guard against this at the rule-toggle level). This status never
// fires for a connection whose policyId is null -- that's the deliberate
// "None" choice (unrestricted access, e.g. a local/sandbox DB), not a drift
// case to catch. MCP never runs a query behind a policy decision that's
// gone stale; this is the explicit runtime check that throws instead,
// matching the enable-time guard (setMcpEnabled/setConnectionPolicy) rather
// than silently succeeding against a policy that quietly went inactive.
function assertWhitelisted(profileId: string): void {
  const status = getMcpAccessStatus(profileId);
  if (status === 'no-active-policy') {
    throw new Error(
      `Connection "${profileId}" has no active access policy. Assign one under Database Connections, or turn ` +
        'on a rule for its policy under Access Policy.',
    );
  }
  if (status !== 'ok') {
    throw new Error(
      `Connection "${profileId}" is not enabled for MCP access. Enable it in Settings -> Connections first.`,
    );
  }
}

export function startControlPlaneServer(options: StartControlPlaneServerOptions): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/connections') {
        return sendJson(res, 200, { connections: listMcpEnabledConnections() });
      }

      // Grouping matters: without the inner parentheses the '/explain'
      // arm matches any method, so a bodyless GET /explain would fall into
      // this handler and hang in readJsonBody.
      if (req.method === 'POST' && (req.url === '/query' || req.url === '/explain')) {
        const body = await readJsonBody(req);
        const { profileId, expression } = body ?? {};
        if (!profileId || typeof expression !== 'string') {
          return sendJson(res, 400, { error: 'profileId and expression are required' });
        }
        assertWhitelisted(profileId);

        const mainWindow = options.getMainWindow();
        if (!mainWindow) {
          return sendJson(res, 503, { error: 'The beamlynx window is not available yet' });
        }

        const kind = req.url === '/explain' ? 'build' : 'eval';
        const result = await runInRenderer(mainWindow, { kind, profileId, expression });
        return sendJson(res, 200, { result });
      }

      // request_reveal (see stdio-relay.ts). Returns immediately with a
      // request id rather than blocking on the human's response the way
      // /query and /explain block on the renderer's -- a review can take
      // minutes, far past any timeout an MCP client or this server itself
      // would tolerate on one call. check_reveal (GET /reveal/:id below) is
      // how the agent finds out what happened.
      if (req.method === 'POST' && req.url === '/reveal') {
        const body = await readJsonBody(req);
        const { profileId, expression, reason } = body ?? {};
        if (!profileId || typeof expression !== 'string') {
          return sendJson(res, 400, { error: 'profileId and expression are required' });
        }
        assertWhitelisted(profileId);

        const mainWindow = options.getMainWindow();
        if (!mainWindow) {
          return sendJson(res, 503, { error: 'The beamlynx window is not available yet' });
        }

        const request = createRevealRequest(profileId, expression, typeof reason === 'string' ? reason : undefined);
        // Fire-and-forget: RevealRequestHandler.tsx (beamlynx-ui) opens a
        // real tab for the owner to review. Nothing here awaits that --
        // the whole point is that this HTTP call returns right away.
        mainWindow.webContents.send('mcp:reveal-request', request);
        return sendJson(res, 200, { requestId: request.id, status: request.status });
      }

      // Always 200, even for an id this process has never seen (a stale id
      // from a previous app run, or a typo) -- `request: null` is a normal,
      // expected outcome check_reveal has to render a message for
      // (format.ts's formatRevealStatus), not a transport-level failure the
      // relay's controlPlaneRequest should reject on.
      if (req.method === 'GET' && req.url?.startsWith('/reveal/')) {
        const id = decodeURIComponent(req.url.slice('/reveal/'.length));
        return sendJson(res, 200, { request: getRevealRequest(id) ?? null });
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (e) {
      sendJson(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  // Loopback only, explicitly -- this is new attack surface (a second HTTP
  // server alongside pine-lang's own, see the bind-host hardening in
  // pine-lang/src/pine/core.clj) and must never be reachable off-machine.
  server.listen(CONTROL_PLANE_PORT, '127.0.0.1');
  return server;
}
