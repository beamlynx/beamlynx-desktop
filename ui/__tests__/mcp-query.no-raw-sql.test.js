// Regression tests for the hard rule in
// beamlynx-plans/pending/2026-08-15-mcp-server-and-url-scheme.md: the MCP
// server must NEVER have a path to raw SQL execution, under any
// configuration, and must always be redacted by whichever access policy its
// connection has assigned -- never governed by the human-only bypass.
//
// Most assertions here call the real functions (store/mcp-query.ts's
// runMcpQuery/explainMcpQuery with a fake McpQueryDeps -- exactly what that
// parameter is for; store/client.ts's effectiveAccessPolicyRules; a real
// store/session.ts Session; a real store/global.store.ts GlobalStore for the
// one piece of wiring that doesn't reach the network) and assert on real
// return values -- a logic bug (e.g. swapping && for ||, or reading the
// wrong flag) fails these for real, not just when a token happens to go
// missing from the source.
//
// Two checks stay as source-text scans, deliberately: "this file must never
// call client.sql/client.useConnection anywhere" is a claim about the WHOLE
// file, not about one call's behavior -- a runtime test only proves it
// wasn't hit on the specific path exercised, a source scan proves it over
// every line. That's the right tool for those two, not a shortcut.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runMcpQuery, explainMcpQuery } = require('../store/mcp-query.ts');
const { effectiveAccessPolicyRules } = require('../store/client.ts');
const { Session } = require('../store/session.ts');
const { GlobalStore } = require('../store/global.store.ts');

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const MCP_QUERY_SOURCE = stripComments(fs.readFileSync(path.join(__dirname, '..', 'store', 'mcp-query.ts'), 'utf-8'));
const GLOBAL_STORE_SOURCE = stripComments(fs.readFileSync(path.join(__dirname, '..', 'store', 'global.store.ts'), 'utf-8'));

test('mcp-query.ts never calls client.sql (raw SQL execution)', () => {
  assert.ok(
    !/\.sql\s*\(/.test(MCP_QUERY_SOURCE),
    'store/mcp-query.ts must never call client.sql() -- raw SQL execution must not be reachable from an MCP client, ' +
      'not even behind a flag. See the "No run_sql tool" rule in beamlynx-plans/pending/2026-08-15-mcp-server-and-url-scheme.md.',
  );
});

test('mcp-query.ts only drives pine-lang through connections/eval/build', () => {
  // The only HttpClient methods this file is allowed to call at all.
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

// Fake McpQueryDeps -- exactly the shape runMcpQuery/explainMcpQuery are
// designed to take. `calls` records every dependency invocation in order,
// so ordering assertions (resolveAccessPolicyRules before evaluate/build)
// can check real call sequence, not just that both happened.
function makeFakeDeps(overrides = {}) {
  const calls = [];
  const session = {
    id: 'mcp-session',
    inputMode: 'pine',
    columns: [{ name: 'id' }],
    error: '',
    evaluate: async () => {
      calls.push('session.evaluate');
      return [{ id: 1 }];
    },
    ...overrides.session,
  };
  const deps = {
    client: {
      createConnection: async () => {
        calls.push('client.createConnection');
        return 'conn-1';
      },
      build: async (...args) => {
        calls.push('client.build');
        return { query: 'select 1', args };
      },
    },
    getSavedProfileCredentials: async () => ({ dbHost: 'h', dbPort: '5432', dbName: 'd', dbUser: 'u', dbPassword: 'p' }),
    getOrCreateMcpSession: () => session,
    getMcpConnectionId: () => undefined,
    setMcpConnectionId: () => {},
    resolveAccessPolicyRules: async () => {
      calls.push('resolveAccessPolicyRules');
      return [{ type: 'foreign-key' }];
    },
    ...overrides.deps,
  };
  return { deps, session, calls };
}

test('mcp-query.ts guards against the Pine delete! write operator unless explicitly allowed', async () => {
  const { deps } = makeFakeDeps();
  delete process.env.BEAMLYNX_MCP_ALLOW_DELETE;
  await assert.rejects(
    () => runMcpQuery(deps, { profileId: 'p1', expression: 'user | delete!.by_id' }),
    /delete!/,
  );
  process.env.BEAMLYNX_MCP_ALLOW_DELETE = '1';
  try {
    await assert.doesNotReject(() => runMcpQuery(deps, { profileId: 'p1', expression: 'user | delete!.by_id' }));
  } finally {
    delete process.env.BEAMLYNX_MCP_ALLOW_DELETE;
  }
});

test('runMcpQuery refuses to evaluate a session that somehow isn\'t in pine input mode', async () => {
  const { deps } = makeFakeDeps({ session: { inputMode: 'sql' } });
  await assert.rejects(
    () => runMcpQuery(deps, { profileId: 'p1', expression: 'user' }),
    /not "pine"/,
  );
});

test('runMcpQuery resolves accessPolicyRules before evaluating, not just at session setup', async () => {
  const { deps, calls } = makeFakeDeps();
  await runMcpQuery(deps, { profileId: 'p1', expression: 'user' });
  const resolveIndex = calls.indexOf('resolveAccessPolicyRules');
  const evaluateIndex = calls.indexOf('session.evaluate');
  assert.ok(resolveIndex !== -1 && evaluateIndex !== -1 && resolveIndex < evaluateIndex);
});

test('explainMcpQuery passes the connection\'s freshly-resolved accessPolicyRules straight to client.build', async () => {
  const { deps } = makeFakeDeps({
    deps: { resolveAccessPolicyRules: async () => [{ type: 'column-name', suffix: '_id' }] },
  });
  const result = await explainMcpQuery(deps, { profileId: 'p1', expression: 'user' });
  assert.deepEqual(result.args, [['user'], undefined, 'conn-1', [{ type: 'column-name', suffix: '_id' }]]);
});

// client.ts's effectiveAccessPolicyRules -- the single place that decides
// which rules actually apply. forMcp splits the two callers cleanly: MCP
// (forMcp: true) is gated on mcpEnabled and must never read
// bypassPolicyForOwnQueries; a human tab (forMcp: false) is gated on
// bypassPolicyForOwnQueries and must never read mcpEnabled.
test('effectiveAccessPolicyRules: no policyId means no rules, for either caller', () => {
  const policies = [{ id: 'p1', name: 'X', rules: [{ type: 'foreign-key', enabled: true }] }];
  assert.deepEqual(effectiveAccessPolicyRules({ policyId: null, mcpEnabled: true }, policies, true), []);
  assert.deepEqual(effectiveAccessPolicyRules({ policyId: null }, policies, false), []);
  assert.deepEqual(effectiveAccessPolicyRules(undefined, policies, true), []);
});

test('effectiveAccessPolicyRules: MCP path is gated on mcpEnabled, never on bypassPolicyForOwnQueries', () => {
  const policies = [{ id: 'p1', name: 'X', rules: [{ type: 'foreign-key', enabled: true }] }];
  const conn = { policyId: 'p1', mcpEnabled: true, bypassPolicyForOwnQueries: true };
  assert.deepEqual(effectiveAccessPolicyRules(conn, policies, true), [{ type: 'foreign-key' }]);
  assert.deepEqual(effectiveAccessPolicyRules({ ...conn, mcpEnabled: false }, policies, true), []);
});

test('effectiveAccessPolicyRules: human path is gated on bypassPolicyForOwnQueries, never on mcpEnabled', () => {
  const policies = [{ id: 'p1', name: 'X', rules: [{ type: 'foreign-key', enabled: true }] }];
  const conn = { policyId: 'p1', mcpEnabled: false, bypassPolicyForOwnQueries: false };
  assert.deepEqual(effectiveAccessPolicyRules(conn, policies, false), [{ type: 'foreign-key' }]);
  assert.deepEqual(effectiveAccessPolicyRules({ ...conn, bypassPolicyForOwnQueries: true }, policies, false), []);
});

test('effectiveAccessPolicyRules: only enabled rules are returned, with `enabled` itself stripped', () => {
  const policies = [
    {
      id: 'p1',
      name: 'X',
      rules: [
        { type: 'foreign-key', enabled: true },
        { type: 'column-name', suffix: '_id', enabled: false },
      ],
    },
  ];
  const conn = { policyId: 'p1', mcpEnabled: true };
  assert.deepEqual(effectiveAccessPolicyRules(conn, policies, true), [{ type: 'foreign-key' }]);
});

test('effectiveAccessPolicyRules: an unresolvable policyId (deleted policy) yields no rules, not a throw', () => {
  const policies = [{ id: 'p1', name: 'X', rules: [{ type: 'foreign-key', enabled: true }] }];
  assert.deepEqual(effectiveAccessPolicyRules({ policyId: 'gone', mcpEnabled: true }, policies, true), []);
});

// session.ts's accessPolicyRules getter -- Session.globalStore is typed
// `any`, so a lightweight fake with just the fields the getter reads
// (connections, accessPolicies, mcpSessionId) exercises the real getter
// without needing a full GlobalStore.
test("session.ts's accessPolicyRules getter derives from the connected profile's own rules, live", () => {
  const session = new Session('mcp', {
    connections: [{ id: 'c1', mcpEnabled: true, policyId: 'p1' }],
    accessPolicies: [{ id: 'p1', name: 'X', rules: [{ type: 'foreign-key', enabled: true }] }],
    mcpSessionId: 'session-mcp',
  });
  session.profileId = 'c1';
  assert.deepEqual(session.accessPolicyRules, [{ type: 'foreign-key' }]);

  // Live, not a snapshot taken at construction: editing the shared state
  // afterward must be reflected on the next read. makeAutoObservable (called
  // in Session's constructor) deep-converts the globalStore object passed
  // in into its own observable copy, so the mutation has to go through
  // session.globalStore itself, not the original object literal above --
  // same as production, where Session.globalStore always IS the live
  // GlobalStore instance, never a detached snapshot of it.
  session.globalStore.connections[0].mcpEnabled = false;
  assert.deepEqual(session.accessPolicyRules, []);
});

test("session.ts passes forMcp based on whether this session IS globalStore.mcpSessionId, not a hardcoded value", () => {
  const fakeGlobalStore = {
    connections: [{ id: 'c1', mcpEnabled: true, policyId: 'p1', bypassPolicyForOwnQueries: true }],
    accessPolicies: [{ id: 'p1', name: 'X', rules: [{ type: 'foreign-key', enabled: true }] }],
    mcpSessionId: 'session-mcp',
  };
  const mcpSession = new Session('mcp', fakeGlobalStore);
  mcpSession.profileId = 'c1';
  // forMcp: true -- ignores bypassPolicyForOwnQueries, sees the real rules.
  assert.deepEqual(mcpSession.accessPolicyRules, [{ type: 'foreign-key' }]);

  const humanSession = new Session('human-tab', fakeGlobalStore);
  humanSession.profileId = 'c1';
  // forMcp: false -- this connection's owner switched the policy off for
  // their own queries, so this must come back empty even though mcpEnabled
  // is true and the policy itself is active.
  assert.deepEqual(humanSession.accessPolicyRules, []);
});

test("global.store.ts's getOrCreateMcpSession always creates the dedicated MCP session in pine input mode, wired live to the store", () => {
  const g = new GlobalStore();
  const mcpSession = g.getOrCreateMcpSession();
  assert.equal(mcpSession.inputMode, 'pine');
  assert.equal(g.mcpSessionId, mcpSession.id);
  // Not a hardcoded rule list -- a live GlobalStore.connections/accessPolicies
  // edit made after the session was created must still be reflected, and
  // this session must resolve as the MCP caller because it IS mcpSessionId.
  g.connections = [{ id: 'c1', mcpEnabled: true, policyId: 'p1' }];
  g.accessPolicies = [{ id: 'p1', name: 'X', rules: [{ type: 'foreign-key', enabled: true }] }];
  mcpSession.profileId = 'c1';
  assert.deepEqual(mcpSession.accessPolicyRules, [{ type: 'foreign-key' }]);
});

// This one piece of wiring is kept as a source scan rather than a real call:
// exercising it behaviorally means constructing a GlobalStore whose
// refreshConnections/refreshAccessPolicies don't detect desktop mode, which
// falls through to a REAL, unmocked HttpClient network call
// (client.listConnections()) -- mocking that out is a much bigger and more
// fragile scaffold than this one hardcoded literal is worth. The actual
// decision logic it delegates to (effectiveAccessPolicyRules) is fully
// real-tested above.
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
