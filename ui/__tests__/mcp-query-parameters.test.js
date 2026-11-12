// An agent's SQL with `$1` converts to Pine with a named variable,
// `$tenant_id` (pine-lang's docs/sql-to-pine.md, "Parameters"). The agent
// sends the value by number, {"1": [...]}, and runMcpQuery passes it by the
// name the conversion gave (beamlynx-plans #32).
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runMcpQuery, numberedToNamed } = require('../store/mcp-query.ts');
const { McpWriteRefusalMinVersion } = require('../constants.ts');

const parameters = [
  { number: '1', name: 'tenant_id' },
  { number: '2', name: 'status' },
];

test('values sent by number go by their Pine names, and named ones pass as they are', () => {
  assert.deepEqual(numberedToNamed({ 1: ['t1', 't2'], 2: 'open', limit_to: 5 }, parameters), {
    variables: { tenant_id: ['t1', 't2'], status: 'open', limit_to: 5 },
  });
});

test('a number the SQL does not have is refused, naming the ones it has', () => {
  assert.deepEqual(numberedToNamed({ 3: 'x' }, parameters), {
    error: "`variables` has a value for $3, which the SQL doesn't use. The SQL has $1, $2.",
  });
  assert.deepEqual(numberedToNamed({ 1: 'x' }, []), {
    error: "`variables` has a value for $1, which the SQL doesn't use. The SQL has no $1-style parameters.",
  });
});

test('a value sent both by number and by name is refused', () => {
  assert.match(numberedToNamed({ 1: 'x', tenant_id: 'y' }, parameters).error, /\$1 is \$tenant_id in Pine/);
});

function deps(evaluated) {
  const session = {
    id: 'mcp-session',
    inputMode: 'pine',
    columns: [],
    tableAliases: [],
    error: '',
    evaluate: async opts => {
      evaluated.push(opts);
      return [];
    },
  };
  return {
    client: {
      createConnection: async params => params.id,
      sqlToPine: async () => ({
        expression: '$tenant_id =\n\nt\n | where: tenant_id in $tenant_id',
        warnings: [],
        parameters: [{ number: '1', name: 'tenant_id' }],
      }),
    },
    getSavedProfileCredentials: async () => ({ dbHost: 'h', dbPort: '5432', dbName: 'd', dbUser: 'u', dbPassword: 'p' }),
    getOrCreateMcpSession: () => session,
    isMcpConnectionOpen: () => false,
    markMcpConnectionOpen: () => {},
    resolveAccessPolicyRules: async () => [],
    getServerVersion: () => McpWriteRefusalMinVersion,
  };
}

test("run_sql_as_pine's numbered value reaches the run under its name", async () => {
  const evaluated = [];
  const result = await runMcpQuery(deps(evaluated), {
    profileId: 'p',
    expression: '',
    sql: 'select * from t where tenant_id = any($1)',
    variables: { 1: ['t1'] },
  });
  assert.equal(result.error, '');
  assert.deepEqual(evaluated[0].variables, { tenant_id: ['t1'] });
});

test('a wrong number runs nothing', async () => {
  const evaluated = [];
  const result = await runMcpQuery(deps(evaluated), {
    profileId: 'p',
    expression: '',
    sql: 'select * from t where tenant_id = any($1)',
    variables: { 2: 'x' },
  });
  assert.match(result.error, /The SQL has \$1\./);
  assert.equal(evaluated.length, 0);
});
