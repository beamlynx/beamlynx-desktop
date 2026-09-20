// The entire MCP surface for query execution funnels through the two
// functions here (runMcpQuery, explainMcpQuery) -- deliberately isolated in
// their own small file, not folded into GlobalStore, so that
// __tests__/mcp-query.no-raw-sql.test.ts can assert against this file's
// source text alone. Raw SQL execution (client.sql / pine-lang's
// /api/v1/sql) and any Pine operation that changes data must never be
// reachable from here. The two are excluded differently: raw SQL
// structurally, because nothing here may call client.sql at all; writes by
// asking pine-lang to refuse them per request (allow-writes, below), since
// the same eval path serves the person's own tab, where writes are the
// point. See
// beamlynx-plans/completed/2026-08-15-mcp-server-and-url-scheme.md for why:
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
import { lt } from 'semver';
import { McpWriteRefusalMinVersion } from '../constants';
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
  // The connected pine-lang's version, for assertServerSupportsWriteRefusal.
  // Read through a function rather than captured as a value: the deps object
  // is built once per call site, and the version is only known after the
  // app has talked to the server.
  getServerVersion: () => string | undefined;
};

// An agent must never change the database. That is enforced by pine-lang,
// not here: every eval on this path sends `allow-writes: false`, and the
// server refuses any expression whose operations write -- delete!/update!
// and their d!/u! short forms -- before running it (its
// docs/side-effects.md).
//
// This used to be a regex over the expression text looking for `delete!`.
// It missed `update!` entirely and missed both short forms, because it was
// a second, hand-maintained model of a grammar living in another repo, and
// nothing failed when the two drifted. Asking the parser is the same
// question with no copy to keep in sync, and it covers any write operation
// added later for free.
//
// The one way that could regress is a server too old to know the
// parameter: it would ignore `allow-writes` and run the write anyway. So
// check the version here and fail closed, since the alternative is being
// silently less protected than the regex was.
//
// Against its own constant, not RequiredVersion: that one gates the whole
// app (GlobalStore turns it into the upgrade-required screen), and only
// this path needs the newer server. An agent being refused until the
// server is upgraded is the right blast radius; the person's own app going
// dark is not.
function assertServerSupportsWriteRefusal(serverVersion: string | undefined): void {
  if (!serverVersion || lt(serverVersion, McpWriteRefusalMinVersion)) {
    throw new Error(
      `Refusing to run a Pine expression from the MCP server: pine-lang ${serverVersion ?? '(unknown)'} ` +
        `cannot refuse expressions that change data. Upgrade to ${McpWriteRefusalMinVersion} or newer.`,
    );
  }
}

// Exported for RevealRequestHandler.tsx (via GlobalStore.ensureProfileConnection)
// -- a reveal-review tab needs the exact same "resolve a saved profile to a
// live connection id without pine-lang's shared active-connection singleton,
// and without touching activeSessionId" behavior an MCP query gets, since it
// must never steal focus onto itself the way connectToSavedProfile does (see
// that method's own comment). Not otherwise MCP-specific.
export async function ensureConnection(deps: McpQueryDeps, profileId: string): Promise<string> {
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
  assertServerSupportsWriteRefusal(deps.getServerVersion());
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
  // allowWrites: false unconditionally -- this is the whole guard, so it is
  // set here rather than derived from anything the agent sent.
  const rows = await session.evaluate({ applyServerPrettified: true, allowWrites: false });
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
  // No write check here, deliberately: this builds an expression and never
  // evaluates one, so it cannot change anything. The guard it used to carry
  // was protecting a call that does not touch the database.
  const connectionId = await ensureConnection(deps, profileId);
  // Must match runMcpQuery's session (Session.accessPolicyRules), so a
  // build preview never shows a real value the matching eval would redact.
  const accessPolicyRules = await deps.resolveAccessPolicyRules(profileId);
  const response = await deps.client.build(
    [expression],
    undefined,
    connectionId,
    accessPolicyRules,
  );
  return response;
}
