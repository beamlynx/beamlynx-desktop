// Regression test for the hard rule in
// beamlynx-plans/pending/2026-08-15-mcp-server-and-url-scheme.md: the tool
// surface an MCP client actually sees (src/main/mcp/stdio-relay.ts) must
// never register a `run_sql`-shaped tool, under any configuration. The real
// enforcement for query *execution* lives in beamlynx-ui's
// store/mcp-query.ts (see that repo's own __tests__/mcp-query.no-raw-sql.test.js)
// -- this test guards the other surface: the tool registry Claude actually
// calls into, so a future change can't reintroduce a raw-SQL tool here
// without a test failing, even before it would reach pine-lang.
//
// Plain source-text assertion (this repo has no ts-node/tsx runtime wired
// up for `node --test` on .ts files yet) -- run with: node --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const STDIO_RELAY_SOURCE = stripComments(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'mcp', 'stdio-relay.ts'), 'utf-8'),
);

test('stdio-relay.ts never registers a run_sql tool', () => {
  assert.ok(
    !/registerTool\(\s*['"]run_sql['"]/.test(STDIO_RELAY_SOURCE),
    'src/main/mcp/stdio-relay.ts must never register a run_sql tool -- raw SQL execution must not be reachable ' +
      'from an MCP client, not even behind a flag.',
  );
});

test('stdio-relay.ts registers exactly the expected tool set', () => {
  const registered = [...STDIO_RELAY_SOURCE.matchAll(/registerTool\(\s*['"]([\w-]+)['"]/g)].map(m => m[1]);
  assert.deepEqual(
    registered.sort(),
    ['explain_query', 'get_pine_doc', 'list_connections', 'list_pine_docs', 'open_in_desktop', 'run_query'].sort(),
    'Registered tool set changed -- if this was intentional, update this test; if not, something was added ' +
      '(or removed) unexpectedly.',
  );
});

test('stdio-relay.ts never forwards a raw SQL string to pine-lang (no /sql path anywhere)', () => {
  assert.ok(
    !/\/sql\b/.test(STDIO_RELAY_SOURCE),
    'src/main/mcp/stdio-relay.ts must never reference a "/sql" path -- pine-lang\'s POST /api/v1/sql must not be ' +
      'reachable from the MCP surface.',
  );
});

test('get_pine_doc guards against path traversal in its topic argument', () => {
  assert.ok(
    /resolved\.startsWith\(docsDir/.test(STDIO_RELAY_SOURCE),
    'get_pine_doc\'s getDoc() must confirm the resolved path stays inside docsDir before reading -- topic is ' +
      'untrusted input from the MCP client.',
  );
});
