// Regression test for the hard rule in
// beamlynx-plans/pending/2026-08-15-mcp-server-and-url-scheme.md: the MCP
// server must NEVER have a path to raw SQL execution, under any
// configuration. store/mcp-query.ts (runMcpQuery/explainMcpQuery) is the
// entire MCP query-execution surface -- every future change to it must keep
// these true. Plain source-text assertions rather than executing the
// module: mcp-query.ts is TypeScript and this repo has no ts-node/tsx
// runtime wired up for `node --test` yet, and a static check is actually
// the more robust guard here anyway -- it catches the door being reopened
// even by a change that never gets exercised by a runtime test (e.g. a new
// unused-but-present code path, or a flag that defaults off).
//
// Run with: node --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Comments in these files intentionally *name* the forbidden calls (to
// explain why they're forbidden) -- strip comments before scanning so the
// checks below assert on actual code, not on prose that quotes it.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const MCP_QUERY_SOURCE = stripComments(fs.readFileSync(path.join(__dirname, '..', 'store', 'mcp-query.ts'), 'utf-8'));
const GLOBAL_STORE_SOURCE_RAW = fs.readFileSync(path.join(__dirname, '..', 'store', 'global.store.ts'), 'utf-8');
const GLOBAL_STORE_SOURCE = stripComments(GLOBAL_STORE_SOURCE_RAW);
const SESSION_SOURCE = stripComments(fs.readFileSync(path.join(__dirname, '..', 'store', 'session.ts'), 'utf-8'));
const CLIENT_SOURCE = stripComments(fs.readFileSync(path.join(__dirname, '..', 'store', 'client.ts'), 'utf-8'));

test('mcp-query.ts never calls client.sql (raw SQL execution)', () => {
  assert.ok(
    !/\.sql\s*\(/.test(MCP_QUERY_SOURCE),
    'store/mcp-query.ts must never call client.sql() -- raw SQL execution must not be reachable from an MCP client, ' +
      'not even behind a flag. See the "No run_sql tool" rule in beamlynx-plans/pending/2026-08-15-mcp-server-and-url-scheme.md.',
  );
});

test('mcp-query.ts only drives pine-lang through connections/eval/build', () => {
  // The only HttpClient methods this file is allowed to call at all.
  const allowedClientCalls = ['client.createConnection', 'deps.client.createConnection', 'deps.client.build'];
  const clientCallPattern = /\bclient\.(\w+)\s*\(/g;
  const found = new Set();
  let match;
  while ((match = clientCallPattern.exec(MCP_QUERY_SOURCE))) {
    found.add(match[1]);
  }
  const disallowed = [...found].filter(name => !['createConnection', 'build'].includes(name));
  assert.deepEqual(
    disallowed,
    [],
    `store/mcp-query.ts calls client.${disallowed.join(', client.')}(), which isn't in the allowed set ` +
      `(createConnection, build). Session.evaluate() (not a direct client call) handles eval.`,
  );
});

test('mcp-query.ts never calls client.useConnection (the shared-active-connection mutator)', () => {
  assert.ok(
    !/\.useConnection\s*\(/.test(MCP_QUERY_SOURCE),
    'store/mcp-query.ts must never call client.useConnection() / pine-lang\'s POST /connections/:id/connect -- ' +
      "that mutates the server-global active-connection singleton shared with the human's own UI session.",
  );
});

test('mcp-query.ts never sets a session to SQL input mode', () => {
  assert.ok(
    !/inputMode\s*=\s*['"]sql['"]/.test(MCP_QUERY_SOURCE),
    'store/mcp-query.ts must never switch a session to SQL input mode -- Session.evaluate() branches on ' +
      'inputMode and would call client.sql() if it were ever "sql".',
  );
});

test("global.store.ts's MCP session is always created in pine input mode", () => {
  assert.ok(
    /getOrCreateMcpSession[\s\S]{0,400}inputMode\s*=\s*['"]pine['"]/.test(GLOBAL_STORE_SOURCE),
    'global.store.ts\'s getOrCreateMcpSession must set inputMode to "pine" when creating the dedicated MCP tab.',
  );
});

test('mcp-query.ts guards against the Pine delete! write operator by default', () => {
  assert.ok(
    /delete!/.test(MCP_QUERY_SOURCE) && /BEAMLYNX_MCP_ALLOW_DELETE/.test(MCP_QUERY_SOURCE),
    'store/mcp-query.ts must reject expressions containing delete! unless BEAMLYNX_MCP_ALLOW_DELETE=1 is set.',
  );
});

// Access policy (pine-lang's pine.access-policy): named, user-creatable
// policies (GlobalStore.accessPolicies, Settings -> Access Policy), not a
// hardcoded policy and not a caller-level flag. Session.accessPolicyRules
// derives the rules that actually apply (via client.ts's
// effectiveAccessPolicyRules) for whichever profile the session is
// connected to. MCP has no "unprotected" state: mcpEnabled can only be true
// while the connection's own policy already has an active rule (see
// beamlynx-desktop's credential-store.ts), so the dedicated MCP session
// always gets that policy. A human's own tab instead follows the
// connection's bypassPolicyForOwnQueries flag, independent of mcpEnabled --
// so a person can see real data in their own tab (e.g. while debugging)
// without that ever weakening what the agent sees on the same connection.
// A regression back to a hardcoded per-session flag, a hardcoded rule list,
// or the MCP path reading bypassPolicyForOwnQueries would silently leak
// real column values to an agent or over/under-redact a human's
// connections, with no error on either side.
test("session.ts derives `accessPolicyRules` from the connected profile's own rules, not a fixed per-session value", () => {
  assert.ok(
    /get\s+accessPolicyRules\s*\(\s*\)[\s\S]{0,400}effectiveAccessPolicyRules/.test(SESSION_SOURCE),
    'store/session.ts must expose `accessPolicyRules` as a getter derived via client.ts\'s ' +
      'effectiveAccessPolicyRules (GlobalStore.connections), not a plain assignable field or a hardcoded list.',
  );
  assert.ok(
    !/^\s*(restricted|accessPolicyRules)\s*:\s*(boolean|AccessPolicyRule)/m.test(SESSION_SOURCE),
    'store/session.ts must not declare `restricted`/`accessPolicyRules` as a plain field -- it has to be ' +
      'derived per-connection, not set once per session.',
  );
});

test('session.ts passes forMcp based on whether this session IS the dedicated MCP session, not a hardcoded value', () => {
  const start = SESSION_SOURCE.indexOf('get accessPolicyRules');
  assert.ok(start !== -1, 'accessPolicyRules getter not found in store/session.ts');
  const body = SESSION_SOURCE.slice(start, SESSION_SOURCE.indexOf('\n  }', start) + 4);
  assert.ok(
    /mcpSessionId/.test(body) && /effectiveAccessPolicyRules\(/.test(body) && /,\s*forMcp\s*\)\s*;/.test(body),
    'store/session.ts must compare this session\'s id against globalStore.mcpSessionId to decide forMcp, and ' +
      'forward it as effectiveAccessPolicyRules\'s third argument -- a hardcoded true/false here would either ' +
      "always apply MCP's unconditional redaction to a human's tab, or let bypassPolicyForOwnQueries silently " +
      "govern what an MCP agent sees.",
  );
});

test('client.ts\'s effectiveAccessPolicyRules requires policyId always, but branches mcpEnabled vs bypassPolicyForOwnQueries on forMcp', () => {
  const start = CLIENT_SOURCE.indexOf('function effectiveAccessPolicyRules');
  assert.ok(start !== -1, 'effectiveAccessPolicyRules not found in store/client.ts');
  const body = CLIENT_SOURCE.slice(start, CLIENT_SOURCE.indexOf('\n}', start) + 2);
  assert.ok(
    /policyId/.test(body) && /\.find\(/.test(body),
    'effectiveAccessPolicyRules must look up connection.policyId among the given policies for every caller -- ' +
      "forwarding it unresolved would send a stale/deleted policy's rules instead of none.",
  );
  assert.ok(
    /forMcp/.test(body) && /mcpEnabled/.test(body) && /bypassPolicyForOwnQueries/.test(body),
    'effectiveAccessPolicyRules must branch on its forMcp parameter: the MCP caller (forMcp: true) checks ' +
      'connection.mcpEnabled and must never read bypassPolicyForOwnQueries, while a human tab (forMcp: false) ' +
      'checks bypassPolicyForOwnQueries and must never depend on mcpEnabled -- collapsing the two would either ' +
      "let a human's own bypass silently apply to MCP, or make MCP redaction depend on a flag that only governs " +
      'the human side.',
  );
});

test("global.store.ts's resolveAccessPolicyRules always passes forMcp: true to effectiveAccessPolicyRules", () => {
  const start = GLOBAL_STORE_SOURCE.indexOf('resolveAccessPolicyRules:');
  assert.ok(start !== -1, 'resolveAccessPolicyRules not found in store/global.store.ts');
  const body = GLOBAL_STORE_SOURCE.slice(start, GLOBAL_STORE_SOURCE.indexOf('\n    },', start) + 6);
  assert.ok(
    /effectiveAccessPolicyRules\(/.test(body) && /,\s*true\s*\)\s*;/.test(body),
    'resolveAccessPolicyRules -- the only path runMcpQuery/explainMcpQuery use to resolve rules -- must call ' +
      'effectiveAccessPolicyRules with forMcp hardcoded to true. It has no Session to derive forMcp from the ' +
      "way Session.accessPolicyRules does, and this is only ever reached from the MCP path, so a `false` or " +
      "computed value here would let a connection's bypassPolicyForOwnQueries silently leak into what MCP sees.",
  );
});

test("global.store.ts's getOrCreateMcpSession does not hardcode a policy (connection-level now, not caller-level)", () => {
  assert.ok(
    !/getOrCreateMcpSession[\s\S]{0,400}(restricted|accessPolicyRules)\s*=/.test(GLOBAL_STORE_SOURCE),
    'getOrCreateMcpSession must not set `restricted`/`accessPolicyRules` directly -- Session.accessPolicyRules ' +
      "now derives it from the connected profile's own rules, so it applies to a human's tab on the same " +
      'connection too.',
  );
});

test('explainMcpQuery passes the connection\'s own, freshly-resolved accessPolicyRules to client.build', () => {
  assert.ok(
    /deps\.client\.build\(\s*\[expression\]\s*,\s*undefined\s*,\s*connectionId\s*,\s*accessPolicyRules\s*\)/.test(
      MCP_QUERY_SOURCE,
    ) && /await\s+deps\.resolveAccessPolicyRules\(\s*profileId\s*\)/.test(MCP_QUERY_SOURCE),
    'explainMcpQuery must resolve accessPolicyRules via `await deps.resolveAccessPolicyRules(profileId)` and ' +
      'pass it to client.build -- a build preview must never show a real value the matching eval would have ' +
      "redacted, and it must reflect the connection's *current* rules (re-read from disk), not a hardcoded " +
      'flag or a stale in-memory snapshot from app boot.',
  );
});

// Regression for a real bug hit in practice: a rule added to a connection's
// accessPolicyRules while the app was already running (there's no settings
// UI yet, so hand-editing connections.json is the only way) had no effect
// until something else happened to refresh GlobalStore.connections (a
// reconnect, or an app restart) -- runMcpQuery kept evaluating against
// whatever the policy was at app boot, silently. A security control that
// only picks up a change after an unrelated, undocumented trigger is worse
// than confusing -- it's a false sense of having fixed something.
test('runMcpQuery resolves accessPolicyRules (refreshing GlobalStore.connections) before evaluating, not just at session setup', () => {
  const runMcpQuerySource = MCP_QUERY_SOURCE.slice(
    MCP_QUERY_SOURCE.indexOf('export async function runMcpQuery'),
    MCP_QUERY_SOURCE.indexOf('export async function explainMcpQuery'),
  );
  const resolveIndex = runMcpQuerySource.search(/await\s+deps\.resolveAccessPolicyRules\(\s*profileId\s*\)/);
  const evaluateIndex = runMcpQuerySource.indexOf('session.evaluate(');
  assert.ok(
    resolveIndex !== -1 && evaluateIndex !== -1 && resolveIndex < evaluateIndex,
    'runMcpQuery must call `await deps.resolveAccessPolicyRules(profileId)` before session.evaluate() -- ' +
      'evaluate() reads Session.accessPolicyRules from GlobalStore.connections, which must already be fresh ' +
      'by that point, not whatever it happened to be at app boot or last reconnect.',
  );
});
