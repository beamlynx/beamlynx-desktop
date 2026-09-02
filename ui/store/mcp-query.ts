// The entire MCP surface for query execution funnels through the two
// functions here (runMcpQuery, explainMcpQuery) -- deliberately isolated in
// their own small file, not folded into GlobalStore, so that
// __tests__/mcp-query.no-raw-sql.test.ts can assert against this file's
// source text alone. Raw SQL execution (client.sql / pine-lang's
// /api/v1/sql) and Pine's own `delete!` write operator must never be
// reachable from here. See
// beamlynx-plans/pending/2026-08-15-mcp-server-and-url-scheme.md for why:
// Pine expressions compile through pine-lang's AST layer, a real choke
// point for column-level restrictions; raw SQL has no such choke point, so
// it's excluded structurally rather than by a runtime flag. That choke
// point is now used for real, as a connection-level decision rather than a
// caller-level one: each connection independently selects which named
// access policy (if any) applies to it (Database Connections' own picker;
// the policies themselves live in Settings -> Access Policy -- see
// credential-store.ts), so a human's own tab on that connection is
// redacted exactly like the MCP tab is.
//
// resolveAccessPolicyRules always re-reads connections.json fresh (via
// GlobalStore.refreshConnections/refreshAccessPolicies) before resolving
// the policy, rather than trusting the in-memory snapshot -- that snapshot
// is only ever loaded on specific triggers (connect/disconnect/app boot,
// or this session's own edit), so without this an access-policy edit made
// from a different running instance would silently keep using stale rules
// until something else happened to refresh the list, with no visible
// error. A live query surface enforcing a security control cannot afford
// that kind of "works after you happen to restart" gap. The extra IPC
// round trip (local, sub-millisecond) is a trivial cost per MCP query for
// that guarantee. runMcpQuery calls it to refresh GlobalStore state as a
// side effect, before session.evaluate() reads Session.accessPolicyRules
// internally; explainMcpQuery uses its return value directly, since it
// calls client.build() with no Session involved. See pine-lang's
// pine.access-policy for what the rules actually do server-side.
import { AccessPolicyRule, HttpClient } from './client';
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
  resolveAccessPolicyRules: (profileId: string) => Promise<AccessPolicyRule[]>;
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
  // Refreshes GlobalStore.connections as a side effect (see this file's top
  // comment) -- session.evaluate() below reads Session.accessPolicyRules,
  // which is derived from that same connection list, so it must be current
  // by the time evaluate() runs, not whatever it happened to be at app boot.
  await deps.resolveAccessPolicyRules(profileId);
  const session = deps.getOrCreateMcpSession();
  session.connectionId = connectionId;
  session.profileId = profileId;
  session.expression = expression;
  assertPineInputMode(session);
  // applyServerPrettified: true -- shows the agent's expression nicely
  // formatted in the Pine panel using pine-lang's own prettified rendering
  // of it (already computed as part of this same eval call, see
  // client.ts's Response.prettified), instead of the raw string the agent
  // sent verbatim.
  const rows = await session.evaluate({ applyServerPrettified: true });
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
  // Must match runMcpQuery's session (Session.accessPolicyRules), so a
  // build preview never shows a real value the matching eval would redact.
  const accessPolicyRules = await deps.resolveAccessPolicyRules(profileId);
  const response = await deps.client.build([expression], undefined, connectionId, accessPolicyRules);
  return response;
}
