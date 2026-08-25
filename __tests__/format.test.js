// Tests for src/main/mcp/format.ts -- everything an MCP client actually
// reads. The first suite here is the important one: it guards the hard rule
// that no MCP output may contain SQL. Pine is the translation layer and the
// enforcement choke point (see beamlynx-plans/pending/
// 2026-08-15-mcp-server-and-url-scheme.md); an agent shown SQL starts
// reasoning in SQL and trying to send it back, which makes that layer
// meaningless.
//
// Runs against dist/, not src/ -- this repo's Node is v20, which has no
// TypeScript stripping, so `npm test` builds first. That's also why
// format.ts imports nothing from electron: requiring it here has to work in
// plain Node.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist', 'main', 'mcp', 'format.js');
assert.ok(fs.existsSync(DIST), 'dist/main/mcp/format.js is missing -- run `npm run build` first (npm test does).');
const {
  formatCompletion,
  formatConnections,
  formatTableMatches,
  formatRows,
  formatExpressionError,
  pickDocTopic,
} = require(DIST);

const noDocs = () => null;

// Shaped exactly like a real pine-lang build response for `user | ` --
// captured from a live server, trimmed to the fields format.ts reads.
const JOIN_RESPONSE = {
  ast: {
    prettified: 'user\n | ',
    'selected-tables': [{ schema: null, table: 'user', alias: 'u_0' }],
    hints: {
      table: [
        { schema: 'public', table: 'tenant', column: 'id', resolution: 'fk', parent: true, pine: 'public.tenant .tenant_id :parent' },
        { schema: 'public', table: 'person', column: 'user_id', resolution: 'heuristic', pine: 'public.person .user_id' },
        { schema: 'public', table: 'document', column: 'userId', resolution: 'fk', pine: 'public.document .userId' },
        { schema: 'public', table: 'legacy', column: 'id', resolution: 'synthetic', pine: 'public.legacy .id' },
      ],
      select: [],
    },
  },
};

const COLUMN_RESPONSE = {
  ast: {
    prettified: 'user\n | select: ',
    'selected-tables': [
      { schema: null, table: 'user', alias: 'u_0' },
      { schema: 'public', table: 'document', alias: 'd_1' },
    ],
    hints: {
      table: [],
      select: [
        { column: 'id', alias: 'd_1' },
        { column: 'userId', alias: 'd_1' },
      ],
    },
  },
};

const TABLE_SEARCH_RESPONSE = {
  ast: {
    hints: {
      table: [
        { schema: 'public', table: 'tenant', pine: 'public.tenant' },
        { schema: 'public', table: 'tenant_role', pine: 'public.tenant_role' },
      ],
    },
  },
};

// The real thing, including the grammar's raw regex terminals.
const PARSE_ERROR =
  'Parse error at line 1, column 13:\nuser | wehre: x\n            ^\nExpected one of:\n.\n|\n' +
  '#"(?s)/\\*.*?\\*/"\n--\n#"[ \\t\\r\\n]+"\n#"[A-Za-z][A-Za-z0-9-_]*"\nnot\nin\nis\n=\nilike\nlike\n=>\n\n';

// ---------------------------------------------------------------------------
// The hard rule
// ---------------------------------------------------------------------------

// Case-SENSITIVE on purpose. Pine's own operations are lowercase and share
// several names with SQL (`select:`, `order:`, `group:`, `limit:`), so a
// case-insensitive match would flag every legitimate Pine hint. pine-lang
// emits SQL keywords uppercase -- `SELECT "u_0".* FROM "user" ...` -- which
// makes case the clean discriminator between the two languages.
const SQL_KEYWORDS = /\b(SELECT|FROM|WHERE|INSERT|UPDATE|CREATE TABLE|INNER JOIN|LEFT JOIN|GROUP BY|ORDER BY)\b/;

test('no output path emits SQL', () => {
  const outputs = [
    formatCompletion('user | ', JOIN_RESPONSE, noDocs),
    formatCompletion('user | select: ', COLUMN_RESPONSE, noDocs),
    formatCompletion('user | wehre: x', { error: PARSE_ERROR }, noDocs),
    formatTableMatches('ten', TABLE_SEARCH_RESPONSE),
    formatRows({ columns: [{ column: 'id' }], rows: [['id'], ['1']] }),
  ];
  for (const out of outputs) {
    assert.ok(!SQL_KEYWORDS.test(out), `MCP output must never contain SQL, got:\n${out}`);
  }
});

test('formatCompletion ignores a compiled SQL query even when the response carries one', () => {
  // pine-lang's build response includes `query` (the compiled SQL). It must
  // never be read -- this is the regression guard for someone adding it back
  // as a "helpful" confirmation of what the expression means.
  const withQuery = { ...JOIN_RESPONSE, query: 'SELECT "u_0".* FROM "user" AS "u_0" LIMIT 250;' };
  const out = formatCompletion('user | ', withQuery, noDocs);
  assert.ok(!out.includes('SELECT'), 'response.query must never reach the agent');
  assert.ok(!out.includes('LIMIT 250;'));
});

// ---------------------------------------------------------------------------
// Ranking and truncation
// ---------------------------------------------------------------------------

test('foreign-key joins rank above ones guessed from column naming', () => {
  const out = formatCompletion('user | ', JOIN_RESPONSE, noDocs);
  assert.ok(out.indexOf('public.document .userId') < out.indexOf('public.person .user_id'));
  assert.match(out, /joins \(real foreign key\):/);
  assert.match(out, /guessed from column naming/);
});

test('synthetic joins are grouped with the guesses, not the foreign keys', () => {
  const out = formatCompletion('user | ', JOIN_RESPONSE, noDocs);
  const guessedSection = out.slice(out.indexOf('guessed from column naming'));
  assert.ok(guessedSection.includes('public.legacy .id'), 'a synthetic id=id join is not a confirmed relationship');
});

test('truncation is announced, never silent', () => {
  const many = {
    ast: {
      prettified: 'user | ',
      'selected-tables': [{ schema: null, table: 'user', alias: 'u_0' }],
      hints: {
        table: Array.from({ length: 40 }, (_, i) => ({
          schema: 'public',
          table: `t${i}`,
          column: 'id',
          resolution: 'fk',
          pine: `public.t${i} .id`,
        })),
      },
    },
  };
  const out = formatCompletion('user | ', many, noDocs);
  assert.match(out, /\+\d+ more/, 'a capped list must say how much it dropped');
  assert.ok(!out.includes('public.t39 .id'), 'sanity check: the tail really was dropped');
});

test('find_tables reports the full match count when it shows a subset', () => {
  const many = {
    ast: { hints: { table: Array.from({ length: 60 }, (_, i) => ({ schema: 'public', table: `t${i}`, pine: `public.t${i}` })) } },
  };
  const out = formatTableMatches('t', many);
  assert.match(out, /of 60 matches/);
});

test('find_tables says so when nothing matched', () => {
  const out = formatTableMatches('zzz', { ast: { hints: { table: [] } } });
  assert.match(out, /No tables match "zzz"/);
});

// ---------------------------------------------------------------------------
// Context and columns
// ---------------------------------------------------------------------------

test('context is the last selected table, not the AST context alias', () => {
  // The AST's own context/current fields flip meaning between operation
  // types -- see currentTable() in format.ts. Column hints resolve through
  // their own alias.
  const out = formatCompletion('user | public.document .userId | select: ', COLUMN_RESPONSE, noDocs);
  assert.match(out, /context: public\.document/);
  assert.match(out, /public\.document -- id, userId/);
});

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

test('hidden columns are dropped from rows', () => {
  // pine-lang adds a hidden __<alias>__id column for the UI's row identity;
  // it duplicates a column the agent can already see.
  const out = formatRows({
    columns: [
      { column: 'id', 'column-alias': '__u_0__id', hidden: true },
      { column: 'id' },
      { column: 'email' },
    ],
    rows: [
      ['__u_0__id', 'id', 'email'],
      ['abc', 'abc', 'a@example.com'],
    ],
  });
  assert.ok(!out.includes('__u_0__id'), 'the UI-only row-identity column must not reach the agent');
  assert.match(out, /^1 row$/m, 'the header row must not be counted as data');
  assert.match(out, /\["id","email"\]/);
});

test('hidden columns are matched by name, not by position', () => {
  // The regression this guards: pine-lang's /eval returns the hidden column
  // first, but beamlynx-ui's session hands it back last, so `columns` and
  // the row arrays do not line up index for index. Position-based filtering
  // silently dropped a real column and kept the hidden one -- caught only
  // by an end-to-end run, never by a fixture copied from pine-lang.
  const out = formatRows({
    columns: [
      { column: 'id', 'column-alias': '__u_0__id', hidden: true },
      { column: 'id' },
      { column: 'email' },
    ],
    rows: [
      ['id', 'email', '__u_0__id'],
      ['abc', 'a@example.com', 'abc'],
    ],
  });
  assert.ok(!out.includes('__u_0__id'), 'hidden column must be dropped wherever it sits in the row');
  assert.match(out, /\["id","email"\]/);
  assert.match(out, /\["abc","a@example.com"\]/, 'the real columns must survive intact');
});

test('row-identity columns are dropped even with no column metadata', () => {
  const out = formatRows({ rows: [['id', '__u_0__id'], ['abc', 'abc']] });
  assert.ok(!out.includes('__u_0__id'));
  assert.match(out, /\["id"\]/);
});

test('formatRows reports an empty result rather than rendering nothing', () => {
  assert.match(formatRows({ columns: [], rows: [] }), /No rows/);
});

test('formatRows surfaces an execution error verbatim', () => {
  assert.match(formatRows({ error: 'relation "userz" does not exist' }), /relation "userz" does not exist/);
});

// ---------------------------------------------------------------------------
// Docs on failure
// ---------------------------------------------------------------------------

test('a mistyped operation resolves to the right doc topic', () => {
  const match = pickDocTopic(PARSE_ERROR);
  assert.equal(match.token, 'wehre');
  assert.equal(match.topic, 'where');
});

test('a correctly spelled operation still resolves to its doc', () => {
  // The operation is right, the mistake is in what follows it -- that doc is
  // still exactly what the agent needs.
  const err = 'Parse error at line 1, column 20:\nuser | where: status =\n                   ^\nExpected one of:\n\'\n';
  assert.equal(pickDocTopic(err)?.topic, 'where');
});

test('short forms map to their long-form doc', () => {
  const err = "Parse error at line 1, column 10:\nuser | s: !\n         ^\nExpected one of:\n'\n";
  assert.equal(pickDocTopic(err)?.topic, 'select');
});

test('a non-parse error resolves to no doc', () => {
  assert.equal(pickDocTopic('Connection refused'), null);
});

test('an unrelated token is not force-matched to an operation', () => {
  const err = 'Parse error at line 1, column 12:\ncustomers zz$\n           ^\nExpected one of:\n|\n';
  assert.equal(pickDocTopic(err), null);
});

test('the matched doc is pushed inline with the error', () => {
  const out = formatExpressionError('user | wehre: x', PARSE_ERROR, topic =>
    topic === 'where' ? '# Where\n\nKeeps only the rows matching a condition.' : null,
  );
  assert.match(out, /Closest match: `where:`/);
  assert.match(out, /Pine reference: where/);
  assert.match(out, /Keeps only the rows matching a condition/);
});

test('grammar regex terminals are stripped from parse errors', () => {
  const out = formatExpressionError('user | wehre: x', PARSE_ERROR, noDocs);
  assert.ok(!out.includes('#"'), 'raw grammar terminals are noise an agent cannot act on');
  assert.match(out, /Expected one of: .*ilike/, 'the operators an agent can act on must survive');
  assert.equal(
    out.split('\n').filter(l => l.startsWith('Expected one of:')).length,
    1,
    'the surviving operators belong on one line, not one line each',
  );
});

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

test('list_connections exposes only the id and label, not stored credentials', () => {
  const out = formatConnections([
    {
      id: '526a03fc',
      label: 'Localhost',
      dbHost: 'localhost',
      dbPort: '5432',
      dbName: 'avallone',
      dbUser: 'postgres',
      createdAt: '2026-08-02T21:13:38.934Z',
    },
  ]);
  assert.match(out, /526a03fc/);
  assert.match(out, /Localhost/);
  for (const leak of ['postgres', '5432', 'createdAt', 'dbUser']) {
    assert.ok(!out.includes(leak), `connection field "${leak}" must not reach the agent; it only ever passes the id back`);
  }
});

test('list_connections explains how to enable one when there are none', () => {
  assert.match(formatConnections([]), /Enable for MCP access/);
});
