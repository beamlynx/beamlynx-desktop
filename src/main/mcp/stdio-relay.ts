// The process an MCP client (Claude Code, Claude Desktop, or any other
// MCP-compatible agent) actually spawns (`command: <installed binary>,
// args: ["--mcp"]`). Deliberately a thin relay, not the thing doing real
// work: it never touches the connection whitelist or pine-lang directly
// (see control-plane-server.ts, which is the enforcement point precisely
// because a hand-rolled client could spawn this same relay and skip
// whatever checks lived here instead). All it does is make sure the real,
// visible GUI is up, then proxy MCP tool calls to its control-plane server.
//
// Thin as a *transport*, but not as an *interface*: what the agent reads is
// rendered by format.ts, never pine-lang's API response verbatim. Those
// responses are shaped for beamlynx-ui, which needs the whole AST to draw
// the relationship graph; an agent needs a ranked list of what it can type
// next. See format.ts for the measurements behind that.
//
// No `run_sql` tool exists here, on purpose, with no flag to add it back --
// see beamlynx-plans/pending/2026-08-15-mcp-server-and-url-scheme.md and
// beamlynx-ui's store/mcp-query.ts for the reasoning. The same rule runs
// the other way too: no tool output may contain SQL either (format.ts).
import { app } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as path from 'path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CONTROL_PLANE_PORT } from './control-plane-server';
import { getResourcesRoot } from '../resources';
import { SERVER_INSTRUCTIONS } from './instructions';
import { formatCompletion, formatConnections, formatRows, formatTableMatches } from './format';
import type { BuildResponse } from './format';

const GUI_LAUNCH_TIMEOUT_MS = 30000;
const GUI_POLL_INTERVAL_MS = 300;

function isControlPlaneUp(): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ port: CONTROL_PLANE_PORT, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function controlPlaneRequest(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: CONTROL_PLANE_PORT,
        path,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : undefined,
        timeout: 35000,
      },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            if ((res.statusCode ?? 200) >= 400) {
              reject(new Error(parsed?.error ?? `control-plane request to ${path} failed (${res.statusCode})`));
              return;
            }
            resolve(parsed);
          } catch {
            reject(new Error(`control-plane returned non-JSON response for ${path}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`control-plane request to ${path} timed out`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// Launches the real, visible GUI app (no --mcp flag) as a detached child so
// it outlives this relay process -- confirmed empirically that an Electron
// process which never calls requestSingleInstanceLock() itself can spawn a
// detached child that takes the lock and keeps running after the parent
// exits (see the throwaway test run during implementation). Whichever gets
// there first wins if two relay invocations race; the loser's spawn just
// fails app.requestSingleInstanceLock() in the child and quits, same as any
// second launch today.
function launchGuiDetached(): void {
  const child = spawn(process.execPath, [], { detached: true, stdio: 'ignore' });
  child.unref();
}

async function ensureGuiRunning(): Promise<void> {
  if (await isControlPlaneUp()) return;
  launchGuiDetached();
  const deadline = Date.now() + GUI_LAUNCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isControlPlaneUp()) return;
    await new Promise(resolve => setTimeout(resolve, GUI_POLL_INTERVAL_MS));
  }
  throw new Error('Timed out waiting for the beamlynx app to start');
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

function buildDeepLink(profileId: string, expression: string): string {
  const params = new URLSearchParams({ connection: profileId, expression });
  return `beamlynx://run?${params.toString()}`;
}

// Pine is a small, custom pipe-based DSL, not SQL -- there's nothing in an
// LLM's general training that teaches it this syntax. Three things cover
// that gap, in order of how little they cost: the always-on primer in
// instructions.ts, the position-specific hints complete_query returns, and
// these docs, pushed inline by format.ts the moment an expression fails to
// parse. get_pine_doc is the manual fallback for when an agent wants a
// topic none of those surfaced.
//
// These are staged into the packaged app by scripts/stage-docs.sh from
// src/main/mcp/pine-reference/ -- hand-maintained, and deliberately
// carrying no SQL translations, unlike beamlynx.com's human-facing
// documentation. See that directory's README.md.
function getDocsDir(): string {
  return path.join(getResourcesRoot(), 'docs');
}

function listDocs(): { topic: string; title: string }[] {
  const docsDir = getDocsDir();
  if (!fs.existsSync(docsDir)) return [];
  return fs
    .readdirSync(docsDir)
    .filter(f => f.endsWith('.md'))
    .map(filename => {
      const lines = fs.readFileSync(path.join(docsDir, filename), 'utf-8').split('\n');
      return {
        topic: filename.replace(/\.md$/, ''),
        title: (lines[0] ?? '').replace(/^#\s*/, '').trim(),
      };
    });
}

// Guards against a crafted topic (e.g. "../../../etc/passwd") escaping
// docsDir -- topic is untrusted input from the MCP client.
function getDoc(topic: string): string | null {
  const docsDir = path.resolve(getDocsDir());
  const resolved = path.resolve(docsDir, `${topic}.md`);
  if (!resolved.startsWith(docsDir + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  return fs.readFileSync(resolved, 'utf-8');
}

// Both complete_query and find_tables are the same pine-lang build call --
// parse the expression, return the hints for wherever it ends. They differ
// only in what gets rendered, since a bare table fragment produces
// "start a pipeline here" hints and a trailing `| ` produces join hints.
// Builds never touch the user's visible tab; only run_query does.
async function build(profileId: string, expression: string): Promise<BuildResponse> {
  await ensureGuiRunning();
  const { result } = await controlPlaneRequest('POST', '/explain', { profileId, expression });
  return result ?? {};
}

async function registerTools(server: McpServer): Promise<void> {
  server.registerTool(
    'list_connections',
    {
      description:
        'List the database connections the user has explicitly enabled for MCP access. ' +
        'A connection not in this list does not exist as far as this tool is concerned, even if it exists in beamlynx.',
    },
    async () => {
      try {
        const { connections } = await controlPlaneRequest('GET', '/connections');
        return textResult(formatConnections(connections ?? []));
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'find_tables',
    {
      description:
        'Find tables in a database by name. Matching is fuzzy, so a fragment is enough -- "ten" finds "tenant", ' +
        '"tenant_role" and "user_tenant_role". Use this instead of guessing at a table name (a singular/plural ' +
        'mismatch like "tenant" vs "tenants" is the usual way that goes wrong). Returns qualified names ready to ' +
        'start a Pine expression with; pass one to complete_query to continue it.',
      inputSchema: {
        connection_id: z.string().describe('A connection id from list_connections'),
        query: z.string().min(1).describe('A fragment of the table name to look for, e.g. "invoice"'),
      },
    },
    async ({ connection_id, query }: { connection_id: string; query: string }) => {
      try {
        // A blank query matches every table -- 249 on a mid-size schema,
        // thousands on a large one. min(1) on the schema plus this covers
        // whitespace-only input the schema would let through.
        if (!query.trim()) {
          return errorResult('find_tables needs a name fragment to search for. Pass at least one character.');
        }
        return textResult(formatTableMatches(query, await build(connection_id, query.trim())));
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'complete_query',
    {
      description:
        'Ask what can be appended to a Pine expression at its current end -- the main tool for building a query ' +
        'step by step without guessing. End the expression with `| ` to get the tables it can join to (ranked, ' +
        'with foreign-key-backed joins first), or with `| select: ` to list the current table\'s columns. Also ' +
        'reports how the expression parsed, and explains the syntax if it did not. Does not execute anything.',
      inputSchema: {
        connection_id: z.string().describe('A connection id from list_connections'),
        expression: z
          .string()
          .describe('A Pine expression, usually a partial one ending in `| ` or `| select: `, e.g. "public.user | "'),
      },
    },
    async ({ connection_id, expression }: { connection_id: string; expression: string }) => {
      try {
        return textResult(formatCompletion(expression, await build(connection_id, expression), getDoc));
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'run_query',
    {
      description:
        'Run a Pine expression against a connection (must be one returned by list_connections) and return the ' +
        'rows. Opens or updates a visible tab in the beamlynx app so the user can see what ran. Pine is not SQL ' +
        'and SQL is not accepted here. Build the expression with find_tables and complete_query rather than ' +
        'guessing at table or column names. Results are capped by the server at 250 rows.',
      inputSchema: {
        connection_id: z.string().describe('A connection id from list_connections'),
        expression: z.string().describe('The Pine expression to run'),
      },
    },
    async ({ connection_id, expression }: { connection_id: string; expression: string }) => {
      try {
        await ensureGuiRunning();
        const { result } = await controlPlaneRequest('POST', '/query', { profileId: connection_id, expression });
        return textResult(formatRows(result ?? {}));
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  // Listing the topics in the description itself, rather than behind a
  // separate list_pine_docs tool, removes a round trip: an agent that needs
  // `where:` can fetch it directly instead of calling one tool to learn the
  // name of the topic it already guessed. The whole doc set is ~13KB, so
  // there was never enough here to be worth paginating over two calls.
  const docTopics = listDocs()
    .map(d => d.topic)
    .sort();
  server.registerTool(
    'get_pine_doc',
    {
      description:
        'Fetch the Pine syntax reference for one topic, with examples. Most of the time complete_query already ' +
        'tells you what you need, and a failed expression returns the relevant topic automatically -- reach for ' +
        'this when you want a topic neither surfaced. ' +
        (docTopics.length ? `Topics: ${docTopics.join(', ')}.` : 'No topics are bundled with this install.'),
      inputSchema: {
        topic: z.string().describe('One of the topics listed in this tool\'s description, e.g. "join" or "where"'),
      },
    },
    async ({ topic }: { topic: string }) => {
      const content = getDoc(topic);
      if (content == null) {
        return errorResult(
          `No doc found for topic "${topic}". Available topics: ${docTopics.join(', ') || '(none bundled)'}.`,
        );
      }
      return textResult(content);
    },
  );

  server.registerTool(
    'open_in_desktop',
    {
      description:
        'Return a beamlynx:// link the user can click to open a Pine expression in the beamlynx app itself. ' +
        'Use this to hand the user something to inspect visually, in addition to or instead of running it yourself.',
      inputSchema: {
        connection_id: z.string().describe('A connection id from list_connections'),
        expression: z.string().describe('The Pine expression the link should open'),
      },
    },
    async ({ connection_id, expression }: { connection_id: string; expression: string }) => {
      return textResult(buildDeepLink(connection_id, expression));
    },
  );
}

export async function startMcpRelay(): Promise<void> {
  // Stdio hygiene: MCP's stdio transport uses stdout exclusively for
  // JSON-RPC framing. Electron/Chromium chatter (GPU process warnings etc.)
  // on stdout would corrupt that stream, so silence everything not
  // explicitly part of the protocol before the transport starts.
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  app.commandLine.appendSwitch('log-level', '3');

  await app.whenReady();

  // `instructions` reaches the client in the initialize response, before
  // any tool call -- the only chance to teach Pine at zero cost. See
  // instructions.ts.
  const server = new McpServer(
    { name: 'beamlynx', version: app.getVersion() },
    { instructions: SERVER_INSTRUCTIONS },
  );
  await registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
