// canDeleteTraverse decides whether "Delete rows..." is offered at all, and it
// is the single thing standing between a click and a delete that removes
// nothing while reporting success (see the function's own comment for the
// mechanism). It is a pure function of the AST, so it is tested here against
// fixtures rather than only through the UI.
//
// The fixture shapes below are real: each `joins` value was taken from
// /api/v1/build against a Postgres schema of
// company -> employee -> document, plus project and a mapping table.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  canDeleteTraverse,
  tablesAboveRoot,
  MAX_DEPTH,
} = require('../store/canvas/traversal.ts');

// A join is a map (see Join in store/client.ts). `parent` names the side that
// owns the key: 'from' means the `from` alias is the parent, 'to' means it is
// the child.
const has = (from, to) => ({
  from,
  to,
  columns: [{ from: 'id', to: 'fk_id' }],
  parent: 'from',
  resolution: 'fk',
  type: null,
  cast: null,
});
const of_ = (from, to) => ({
  from,
  to,
  columns: [{ from: 'fk_id', to: 'id' }],
  parent: 'to',
  resolution: 'fk',
  type: null,
  cast: null,
});
const ast = (current, joins, selectedTables = []) => ({
  current,
  joins,
  'selected-tables': selectedTables,
});

test('canDeleteTraverse allows a single table and a downward chain', () => {
  // `company`
  assert.equal(canDeleteTraverse(ast('c_0', [])).ok, true);
  // `company | employee | document`
  assert.equal(canDeleteTraverse(ast('d_2', [has('c_0', 'e_1'), has('e_1', 'd_2')])).ok, true);
  // A where:/select: between joins adds no table, so current is still the last
  // join's target: `company | employee | where: id = 1`
  assert.equal(canDeleteTraverse(ast('e_1', [has('c_0', 'e_1')])).ok, true);
});

test('canDeleteTraverse blocks an upward join', () => {
  // `employee | company` -- the walk would find `employee` as a child of
  // company, empty it, and leave company's own subquery matching nothing.
  const verdict = canDeleteTraverse(ast('c_1', [of_('e_0', 'c_1')]));
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /parent to child/);

  // One upward join anywhere disqualifies, not just the last.
  assert.equal(canDeleteTraverse(ast('d_2', [of_('e_0', 'c_1'), has('c_1', 'd_2')])).ok, false);
});

test('canDeleteTraverse blocks when current is not the last table', () => {
  // `company | employee | document | from: employee` -- every join is
  // downward, but the walk would visit `document`, which is in the root
  // expression, and empty it before employee's own subquery runs. This is the
  // condition that is easy to forget, because condition 1 passes.
  const verdict = canDeleteTraverse(ast('e_1', [has('c_0', 'e_1'), has('e_1', 'd_2')]));
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /end of the pipe/);
});

test('canDeleteTraverse treats an unresolved join as disqualifying', () => {
  // A null resolution means the direction is unknown. Unknown is not downward.
  const verdict = canDeleteTraverse(
    ast('x_1', [
      { from: 'c_0', to: 'x_1', columns: [], parent: 'from', resolution: null, type: null, cast: null },
    ]),
  );
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /could not be resolved/);
});

test('canDeleteTraverse refuses when there is no table yet', () => {
  assert.equal(canDeleteTraverse(null).ok, false);
  assert.equal(canDeleteTraverse(ast('', [])).ok, false);
});

test('tablesAboveRoot names the tables the root is selected through, not the root', () => {
  // `company | employee`: the walk may meet employee again below itself, but
  // never company. Whether selected-tables lists the root or not, the result
  // is the same, because the root is matched by alias.
  const upper = [{ table: 'company', alias: 'c_0', schema: 'public' }];
  const root = [{ table: 'employee', alias: 'e_1', schema: 'public' }];
  assert.deepEqual([...tablesAboveRoot(ast('e_1', [has('c_0', 'e_1')], upper))], ['company']);
  assert.deepEqual([...tablesAboveRoot(ast('e_1', [has('c_0', 'e_1')], [...upper, ...root]))], ['company']);
});

test('tablesAboveRoot keeps a table above the root that shares its name', () => {
  // `folder as p | folder .parent_id as f`: the root's own child folders are
  // fair game, but `p` is a row the root is selected through.
  const tables = [
    { table: 'folder', alias: 'p', schema: 'public' },
    { table: 'folder', alias: 'f', schema: 'public' },
  ];
  assert.deepEqual([...tablesAboveRoot(ast('f', [has('p', 'f')], tables))], ['folder']);
});

test('the depth cap is a fixed, stated number', () => {
  // Not configurable in v1 -- what matters is that hitting it is reported
  // (TraversalResult.depthCapped) rather than silently truncating the tree.
  assert.equal(typeof MAX_DEPTH, 'number');
  assert.ok(MAX_DEPTH > 0);
});

// pine-lang 0.46.0 removed `delete:`, so a tab saved before the upgrade no
// longer parses -- and in canvas mode a parse error means no ast.ranges, so
// the canvas cannot segment ANY of the expression. The tab comes back blank
// rather than merely missing its last word, which is why this is worth a
// migration rather than letting it fail.
const { stripRemovedDeleteOperation } = require('../store/global.store.ts');

test('a restored expression loses a trailing delete:, and nothing else', () => {
  const cases = [
    ["company | where: id = '1' | delete:", "company | where: id = '1'"],
    ['company | d:', 'company'],
    ['company | DELETE:', 'company'],
    ['company\n | delete: ', 'company'],
    // Untouched: delete! is still real Pine, and still means it.
    ['company | where: id = 1 | delete! .id', 'company | where: id = 1 | delete! .id'],
    // Anchored to a pipe, so a string literal ending in `d:` survives. This is
    // the reason the match is not a bare trailing `d:`.
    ["company | where: name = 'weird d:'", "company | where: name = 'weird d:'"],
    // Only trailing -- a `delete:` mid-expression was never valid anyway, and
    // rewriting the middle of someone's expression is not a migration.
    ['company | delete: | employee', 'company | delete: | employee'],
    ['company', 'company'],
    ['', ''],
  ];
  for (const [input, expected] of cases) {
    assert.equal(stripRemovedDeleteOperation(input), expected, `input: ${JSON.stringify(input)}`);
  }
});

// A composite foreign key used to reach the client as several independent
// single-column relations, and the walk refused to plan a delete through one:
// deleting on one column of such a key over-matches, silently. Confirmed
// against a real database, where deleting one `kase` also removed a
// `case_ref` row belonging to a different kase that merely shared a
// search_id, while that kase survived.
//
// pine-lang now reports one relation carrying every column of the key, so the
// walk names them all in the DELETE and pine matches them as a row. There is
// nothing left to refuse.
const { runTraversal } = require('../store/canvas/traversal.ts');

// Minimal stand-in for HttpClient: enough for runTraversal, no network.
function stubClient(childrenByExpression) {
  return {
    count: async () => 1,
    build: async () => ({ ast: { current: 'k_0', joins: [], 'selected-tables': [] } }),
    makeChildExpressions: async expression => ({
      expressions: childrenByExpression[expression] ?? [],
      ast: {},
    }),
  };
}

const child = (expression, columns, table) => ({
  expression,
  columns,
  table,
  schema: 'public',
});

test('planning a delete through a composite foreign key keys on every column', async () => {
  // case_ref (case_id, search_id) -> kase (id, search_id): one relation, two
  // columns. The node's DELETE has to name both -- `case_id` alone removes
  // every reference belonging to that kase, `search_id` alone removes
  // references belonging to other kases entirely.
  const client = stubClient({
    kase: [child('kase | case_ref .case_id', ['case_id', 'search_id'], 'case_ref')],
  });
  const result = await runTraversal(client, 'kase', { forDelete: true });
  assert.deepEqual(
    result.nodes.map(n => n.columns),
    [['case_id', 'search_id'], ['id']],
  );
});

test('planning a delete allows two separate foreign keys to the same table', async () => {
  // message.sender_id and message.recipient_id both -> appuser.id. Two real
  // relationships, not one key split in half, so deleting the user means
  // deleting both sets.
  const client = stubClient({
    appuser: [
      child('appuser | message .sender_id', ['sender_id'], 'message'),
      child('appuser | message .recipient_id', ['recipient_id'], 'message'),
    ],
  });
  const result = await runTraversal(client, 'appuser', { forDelete: true });
  // Post-order: both message branches, then the root. The root's column is
  // the hardcoded `id` rootTableOf supplies, not a foreign key -- it has no
  // parent to have one.
  assert.deepEqual(
    result.nodes.map(n => n.columns),
    [['sender_id'], ['recipient_id'], ['id']],
  );
});

// The walk only descends, so a table it meets again below itself is a deeper
// set of rows, not a way back up. It follows them until the counts reach zero.
function stubClientRootedAt(table, alias, childrenByExpression, countsByExpression = {}) {
  return {
    ...stubClient(childrenByExpression),
    count: async expression => countsByExpression[expression] ?? 1,
    build: async () => ({
      ast: { current: alias, joins: [], 'selected-tables': [{ table, alias, schema: 'public' }] },
    }),
  };
}

test('a table that references itself is followed down to its leaves', async () => {
  // folder.parent_id -> folder.id: child folders, then theirs, until a level
  // has no rows. Found on company.duplicate_id -> company.id, where the walk
  // used to refuse ("the walk reached company").
  const root = 'tenant | folder .tenant_id';
  const level1 = `${root} | folder .parent_id`;
  const level2 = `${level1} | folder .parent_id`;
  const level3 = `${level2} | folder .parent_id`;
  const client = stubClientRootedAt(
    'folder',
    'f_1',
    { [root]: [child(level1, ['parent_id'], 'folder')], [level1]: [child(level2, ['parent_id'], 'folder')], [level2]: [child(level3, ['parent_id'], 'folder')] },
    { [level3]: 0 },
  );
  const result = await runTraversal(client, root, { forDelete: true, forbidden: new Set(['tenant']) });
  // Deepest first: the grandchildren's DELETE runs before the children's.
  assert.deepEqual(
    result.nodes.map(n => [n.table, n.depth]),
    [['folder', 2], ['folder', 1], ['folder', 0]],
  );
  assert.equal(result.depthCapped, false);
});

test('a table reached again through a second foreign key is followed', async () => {
  // company -> employee (employee.company_id) -> company (company.ceo_id).
  const root = 'company';
  const employees = 'company | employee .company_id';
  const led = `${employees} | company .ceo_id`;
  const client = stubClientRootedAt(
    'company',
    'c_0',
    { [root]: [child(employees, ['company_id'], 'employee')], [employees]: [child(led, ['ceo_id'], 'company')] },
    { [`${led} | employee .company_id`]: 0 },
  );
  const result = await runTraversal(client, root, { forDelete: true, forbidden: new Set() });
  assert.deepEqual(
    result.nodes.map(n => n.table),
    ['company', 'employee', 'company'],
  );
});

test('a loop in the data stops at the depth limit and says so', async () => {
  // Two companies each marked a duplicate of the other: every level has rows.
  const client = {
    ...stubClientRootedAt('company', 'c_0', {}),
    makeChildExpressions: async expression => ({
      expressions: [child(`${expression} | company .duplicate_id`, ['duplicate_id'], 'company')],
      ast: {},
    }),
  };
  const result = await runTraversal(client, 'company', { forDelete: true, forbidden: new Set(), maxDepth: 3 });
  assert.equal(result.depthCapped, true);
  assert.equal(result.nodes.length, 4);
});

test('planning a delete still stops at a table above the root', async () => {
  // employee -> tenant: tenant is what the root's companies are selected
  // through. Emptying it first would make the root's own DELETE match nothing.
  const root = 'tenant | company .tenantId';
  const client = stubClientRootedAt('company', 'c_1', {
    [root]: [child(`${root} | employee .company_id`, ['company_id'], 'employee')],
    [`${root} | employee .company_id`]: [
      child(`${root} | employee .company_id | tenant .employee_id`, ['employee_id'], 'tenant'),
    ],
  });
  await assert.rejects(
    runTraversal(client, root, { forDelete: true, forbidden: new Set(['tenant']) }),
    /the walk reached "tenant"/,
  );
});

test('counting walks a composite foreign key like any other', async () => {
  const client = stubClient({
    kase: [child('kase | case_ref .case_id', ['case_id', 'search_id'], 'case_ref')],
  });
  const result = await runTraversal(client, 'kase', {});
  assert.equal(result.nodes.length, 2);
});


// A block comment cannot wrap an expression that already has one. The tab's
// own note is usually `/* ... */`, and block comments do not nest portably:
// the inner `*/` closes the outer wrapper, the rest of the Pine text spills
// out as bare SQL, and the trailing `*/` is a syntax error on top. Reported
// against a real script, which Postgres refused.
const { buildDeleteScript } = require('../store/canvas/traversal.ts');

const scriptClient = {
  buildDeleteQuery: async () => 'DELETE FROM x WHERE 1=1',
};

const node = (expression, table) => ({
  id: expression,
  parentId: null,
  table,
  schema: 'public',
  column: 'id',
  expression,
  depth: 0,
  count: 1,
});

test('a generated script survives an expression that carries its own comment', async () => {
  const { script, queries } = await buildDeleteScript(scriptClient, [
    node(
      "/* test */ public.tenant as t | where: t.id = '1' | public.user_information .tenant_id",
      'user_information',
    ),
    node("/* test */ public.tenant as t | where: t.id = '1'", 'tenant'),
  ]);

  // Nothing may open a block comment: a line comment cannot be closed early by
  // anything the expression contains, which makes this immune rather than
  // merely escaped.
  assert.ok(!script.includes('/*\n'), 'the script must not wrap anything in a block comment');
  for (const line of script.split('\n')) {
    const isComment = line.startsWith('--');
    const isBlank = line.trim() === '';
    const looksLikeSql = /^\s*(BEGIN|COMMIT|DELETE|WHERE|SELECT|FROM|JOIN|LIMIT|\)|;)/i.test(line);
    assert.ok(
      isComment || isBlank || looksLikeSql,
      `line is neither a comment nor SQL, so the wrapper leaked: ${JSON.stringify(line)}`,
    );
  }

  // The note appears once, at the top -- not above every statement. Every
  // node's expression is its parent's plus one more join, so all of them carry
  // it.
  assert.equal(script.split('/* test */').length - 1, 1);

  // And the per-statement comments still say which expression they came from,
  // one line per step.
  assert.ok(script.includes('-- public.tenant as t'));
  // Pipe at the start of the line, not indented under the previous one.
  assert.ok(script.includes('-- | public.user_information .tenant_id'));

  // The statements come back alongside the script, positionally aligned with
  // the nodes -- the run records them so its log says what actually ran.
  assert.equal(queries.length, 2);
});

// The log of a delete run. The part worth protecting is that it reports what
// it does NOT know: a run can stop partway and be resumed later, so a log
// listing only successes would read as a complete account of an incomplete
// job.
const { buildAuditLog } = require('../store/canvas/traversal.ts');

const outcome = (table, extra) => ({
  table,
  expression: `company | ${table} | limit: 1 | delete! .id`,
  query: `DELETE FROM ${table} WHERE 1=1`,
  at: '2026-09-21T20:00:00.000Z',
  ms: 12,
  ...extra,
});

test('a delete log names what was not deleted, not just what was', () => {
  const log = buildAuditLog(
    {
      rootExpression: '/* clearing out acme */ company | where: id = 1',
      nodes: [node('a', 'document'), node('b', 'employee'), node('c', 'company')],
      outcomes: [
        outcome('document', { deleted: 3 }),
        outcome('employee', { error: 'permission denied' }),
      ],
      run: 'failed',
    },
    'staging (localhost/t)',
  );

  assert.match(log, /Connection {4}staging \(localhost\/t\)/);
  assert.match(log, /Statements {4}2 of 3 attempted/);
  assert.match(log, /Rows deleted {2}3/);
  assert.match(log, /Outcome {7}stopped on an error/);

  // Both the statement that worked and the one that did not.
  assert.match(log, /document {2}--  3 rows deleted/);
  assert.match(log, /employee {2}--  FAILED: permission denied/);

  // The SQL that ran, not only the expression that asked for it.
  assert.match(log, /DELETE FROM document WHERE 1=1/);

  // And the part that makes it an account: a resumed run picks up here.
  assert.match(log, /Not deleted \(2\): employee, company/);

  // The tab's own note is stripped from the header line -- it is prose about
  // the tab, and it would run the summary onto several lines.
  assert.ok(!log.includes('Started from  /* clearing out acme */'));
});

test('a completed delete log does not claim anything is outstanding', () => {
  const log = buildAuditLog(
    {
      rootExpression: 'company | where: id = 1',
      nodes: [node('a', 'document'), node('b', 'company')],
      outcomes: [outcome('document', { deleted: 3 }), outcome('company', { deleted: 1 })],
      run: 'finished',
    },
    'local',
  );
  assert.match(log, /Outcome {7}completed/);
  assert.ok(!log.includes('Not deleted'));
});
