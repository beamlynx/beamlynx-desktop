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
  const { restore } = stubFetch(() => ({ ok: false, status: 404, text: async () => 'Not found', json: async () => ({}) }));
  try {
    const session = new Session('s', { connections: [], accessPolicies: [] });
    session.sqlSchema = SCHEMA;
    await session.loadSqlSchema();
    assert.equal(session.sqlSchema, null);
  } finally {
    restore();
  }
});
