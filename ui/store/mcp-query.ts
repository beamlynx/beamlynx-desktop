// The entire MCP surface for query execution funnels through the two
// functions here (runMcpQuery, explainMcpQuery) -- deliberately isolated in
// their own small file, not folded into GlobalStore, so that
// __tests__/mcp-query.no-raw-sql.test.ts can assert against this file's
// source text alone. Raw SQL execution (client.sql / pine-lang's
// /api/v1/sql) and Pine's own `delete!` write operator must never be
// reachable from here. See
// beamlynx-plans/pending/2026-08-15-mcp-server-and-url-scheme.md for why:
// Pine expressions compile through pine-lang's AST layer, which is a real
// place to enforce future column-level restrictions; raw SQL has no such
// choke point, so it's excluded structurally rather than by a runtime flag.
import { HttpClient } from './client';
import type { Session } from './session';

export type ConnectionParams = {
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
};

export type McpQueryDeps = {
  client: HttpClient;
  getSavedProfileCredentials: (profileId: string) => Promise<ConnectionParams>;
  getOrCreateMcpSession: () => Session;
  getMcpConnectionId: (profileId: string) => string | undefined;
  setMcpConnectionId: (profileId: string, connectionId: string) => void;
};

// Pine's `delete!` pipe operator issues a real DELETE against the database
// (see buildDeleteQuery in client.ts and plugin/delete.plugin.tsx) -- it is
// not a read, so it gets the same default-off treatment raw SQL writes
// would have gotten. Opt-in only, and independent of whether raw SQL is
// ever reintroduced (it won't be, see above).
function assertNoDestructiveOperator(expression: string): void {
  const allowDelete = process.env.BEAMLYNX_MCP_ALLOW_DELETE === '1';
  if (!allowDelete && /\bdelete!\s*\./.test(expression)) {
    throw new Error(
      'Refusing to run a Pine expression containing delete! from the MCP server. ' +
        'Set BEAMLYNX_MCP_ALLOW_DELETE=1 on the machine to allow this explicitly.',
    );
  }
}

async function ensureConnection(deps: McpQueryDeps, profileId: string): Promise<string> {
  const cached = deps.getMcpConnectionId(profileId);
  if (cached) return cached;
  const params = await deps.getSavedProfileCredentials(profileId);
  // create-only -- deliberately never client.useConnection() (pine-lang's
  // POST /connections/:id/connect). That endpoint mutates a server-global
  // "active connection" singleton shared with the human's own open UI
  // session; calling it from here would risk silently redirecting the
  // human's own queries to whatever connection was last used via MCP.
  // Creating a pool alone has no such shared side effect.
  const connectionId = await deps.client.createConnection(params);
  deps.setMcpConnectionId(profileId, connectionId);
  return connectionId;
}

// Hard invariant, checked right before the call that would matter: an MCP
// session must never be in SQL input mode, since Session.evaluate() branches
// on it (default.plugin.tsx: `inputMode === 'sql' ? client.sql(...) :
// client.eval(...)`). Belt-and-suspenders alongside getOrCreateMcpSession
// always setting it to 'pine' -- this throws instead of silently executing
// SQL if that invariant is ever broken by a future change.
function assertPineInputMode(session: Session): void {
  if (session.inputMode !== 'pine') {
    throw new Error(
      `MCP session ${session.id} was in inputMode="${session.inputMode}", not "pine" -- refusing to evaluate. ` +
        'This should be impossible; the MCP session must never be switched to SQL mode.',
    );
  }
}

// Deep-clones through JSON, guaranteeing the result is plain and safe to
// pass across Electron IPC (see the comment on the snapshot below for why
// this has to happen *immediately*, not later).
function toPlainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export async function runMcpQuery(
  deps: McpQueryDeps,
  { profileId, expression }: { profileId: string; expression: string },
): Promise<{ tabId: string; columns: unknown; rows: unknown; error: string }> {
  assertNoDestructiveOperator(expression);
  const connectionId = await ensureConnection(deps, profileId);
  const session = deps.getOrCreateMcpSession();
  session.connectionId = connectionId;
  session.profileId = profileId;
  session.expression = expression;
  assertPineInputMode(session);
  const rows = await session.evaluate();
  // Snapshot to plain JSON synchronously, in the same tick evaluate()
  // resolves in -- not after returning up through McpBridge/preload.
  // Confirmed the hard way: PineTabs renders every session's own <Session>
  // (TabPanel only hides the inactive MCP tab via CSS, it doesn't unmount
  // it), so once session.mode flips to 'result' a real MUI DataGrid mounts
  // for it and mutates the *same* columns array object shortly after --
  // JSON.stringify(session.columns) taken right here succeeds every time,
  // but the identical array read one async hop later (after React's render
  // pass has had a chance to run) fails to clone. Take the copy before
  // yielding back to the event loop at all.
  const tabId = session.id;
  const columns = toPlainJson(session.columns);
  const plainRows = toPlainJson(rows);
  const error = session.error;
  return { tabId, columns, rows: plainRows, error };
}

export async function explainMcpQuery(
  deps: McpQueryDeps,
  { profileId, expression }: { profileId: string; expression: string },
): Promise<{ query?: string; ast?: unknown; error?: string }> {
  assertNoDestructiveOperator(expression);
  const connectionId = await ensureConnection(deps, profileId);
  const response = await deps.client.build([expression], undefined, connectionId);
  return response;
}
