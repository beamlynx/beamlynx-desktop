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
