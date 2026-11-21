// The SQL panel completes table and column names from the connection's
// schema (pine-lang's /sql-schema, docs/sql-hints.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PostgreSQL, MySQL } = require('@codemirror/lang-sql');
const { Session } = require('../store/session.ts');
const { sqlCompletionConfig } = require('../utils/sqlCompletion.ts');

const SCHEMA = {
  dialect: 'postgres',
  'default-schema': 'public',
  tables: [
    { schema: 'public', table: 'company', columns: ['id', 'tenantId'] },
    { schema: 'billing', table: 'plan', columns: ['id'] },
  ],
};

test('the schema becomes CodeMirror settings: nested by schema, with its dialect and default', () => {
  assert.deepEqual(sqlCompletionConfig(SCHEMA), {
    dialect: PostgreSQL,
    schema: { public: { company: ['id', 'tenantId'] }, billing: { plan: ['id'] } },
    defaultSchema: 'public',
  });
  assert.equal(sqlCompletionConfig({ ...SCHEMA, dialect: 'mysql' }).dialect, MySQL);
});

test('no schema, or an empty one, is plain SQL without names', () => {
  assert.deepEqual(sqlCompletionConfig(null), {});
  assert.deepEqual(sqlCompletionConfig({ tables: [] }), {});
});

function stubFetch(answer) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return answer(url);
  };
  return { calls, restore: () => (global.fetch = original) };
}

test("loadSqlSchema loads the session's connection's schema", async () => {
  const { calls, restore } = stubFetch(() => ({ ok: true, status: 200, json: async () => SCHEMA }));
  try {
    const session = new Session('s', { connections: [], accessPolicies: [] });
    session.connectionId = 'c1';
    await session.loadSqlSchema();
    assert.deepEqual(session.sqlSchema, SCHEMA);
    assert.ok(calls[0].url.endsWith('/sql-schema'));
    assert.deepEqual(calls[0].body, { 'connection-id': 'c1' });
  } finally {
    restore();
  }
});

test('a server without /sql-schema means no completion, not an error', async () => {
  const { restore } = stubFetch(() => ({
    ok: false,
    status: 404,
    text: async () => 'Not found',
    json: async () => ({}),
  }));
  try {
    const session = new Session('s', { connections: [], accessPolicies: [] });
    session.sqlSchema = SCHEMA;
    await session.loadSqlSchema();
    assert.equal(session.sqlSchema, null);
  } finally {
    restore();
  }
});

// After JOIN: the joins pine-lang's /sql-join-hints suggests.
const { EditorState } = require('@codemirror/state');
const { CompletionContext } = require('@codemirror/autocomplete');
const { sqlJoinSource } = require('../utils/sqlJoinCompletion.ts');

function complete(doc, fetchJoins) {
  const state = EditorState.create({ doc });
  return sqlJoinSource(fetchJoins)(new CompletionContext(state, doc.length, true));
}

const JOINS = [
  {
    sql: 'employee e ON e.company_id = c.id',
    schema: 'public',
    table: 'employee',
    resolution: 'fk',
  },
  {
    sql: 'invoice i ON i.company_id = c.id',
    schema: 'public',
    table: 'invoice',
    resolution: 'heuristic',
  },
];

test('after JOIN, the joins, replacing the name being typed', async () => {
  const asked = [];
  const result = await complete('select * from company c join emp', async (query, cursor) => {
    asked.push([query, cursor]);
    return JOINS;
  });
  assert.deepEqual(asked, [['select * from company c join emp', 32]]);
  assert.equal(result.from, 29);
  assert.deepEqual(
    result.options.map(o => [o.label, o.detail]),
    [
      ['employee e ON e.company_id = c.id', 'foreign key'],
      ['invoice i ON i.company_id = c.id', 'guessed from column names'],
    ],
  );
});

test('anywhere but after JOIN, the server is not asked', async () => {
  let asked = false;
  const result = await complete('select * from company c where ', async () => {
    asked = true;
    return JOINS;
  });
  assert.equal(result, null);
  assert.equal(asked, false);
});

test('no joins, no list', async () => {
  assert.equal(await complete('select * from t join ', async () => []), null);
});

test("Session.sqlJoinHints sends the cursor and the session's connection, and fails quietly", async () => {
  const { calls, restore } = stubFetch(() => ({
    ok: true,
    status: 200,
    json: async () => ({ joins: JOINS }),
  }));
  try {
    const session = new Session('s', { connections: [], accessPolicies: [] });
    session.connectionId = 'c1';
    assert.deepEqual(await session.sqlJoinHints('select * from company c join ', 29), JOINS);
    assert.ok(calls[0].url.endsWith('/sql-join-hints'));
    assert.deepEqual(calls[0].body, {
      query: 'select * from company c join ',
      cursor: 29,
      'connection-id': 'c1',
    });
  } finally {
    restore();
  }
  const failing = stubFetch(() => ({
    ok: false,
    status: 404,
    text: async () => 'Not found',
    json: async () => ({}),
  }));
  try {
    const session = new Session('s', { connections: [], accessPolicies: [] });
    assert.deepEqual(await session.sqlJoinHints('select * from t join ', 21), []);
  } finally {
    failing.restore();
  }
});
