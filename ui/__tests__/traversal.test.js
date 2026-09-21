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
  tablesInExpression,
  MAX_DEPTH,
} = require('../store/canvas/traversal.ts');

// A JoinRelation is [alias1, col1, direction, alias2, col2, resolution, needsCast].
// 'has' means the `from` alias is the parent; 'of' means it is the child.
const has = (from, to) => [from, to, [from, 'id', 'has', to, 'fk_id', 'fk', false], null];
const of_ = (from, to) => [from, to, [from, 'fk_id', 'of', to, 'id', 'fk', false], null];
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
  // A null relation means the direction is unknown. Unknown is not downward.
  const verdict = canDeleteTraverse(ast('x_1', [['c_0', 'x_1', null, null]]));
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /could not be resolved/);
});

test('canDeleteTraverse refuses when there is no table yet', () => {
  assert.equal(canDeleteTraverse(null).ok, false);
  assert.equal(canDeleteTraverse(ast('', [])).ok, false);
});

test('tablesInExpression covers the pipe including its final table', () => {
  // `selected-tables` deliberately omits the pipe's last table (pipeline.md),
  // so the root table has to be added separately -- otherwise the very table
  // being deleted from would not be in the forbidden set.
  const keys = tablesInExpression(
    ast('e_1', [has('c_0', 'e_1')], [{ table: 'company', alias: 'c_0', schema: 'public' }]),
    'employee',
  );
  assert.deepEqual([...keys].sort(), ['company', 'employee']);
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

// A composite foreign key reaches the client as several independent
// single-column relations (pine-lang's docs/joins.md -- combining them into
// one join is a separate change there). Deleting through one column of such a
// key over-matches, silently: confirmed against a real database, where
// deleting one `kase` also removed a `case_ref` row belonging to a different
// kase that merely shared a search_id, while that kase survived.
//
// The parent side of the join separates the two shapes cleanly, which is what
// makes this detectable at all -- see CompositeKeyError.
const { runTraversal, CompositeKeyError } = require('../store/canvas/traversal.ts');

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

const child = (expression, column, relatedColumn, table) => ({
  expression,
  column,
  relatedColumn,
  table,
  schema: 'public',
});

test('planning a delete refuses a composite foreign key', async () => {
  // case_ref (case_id, search_id) -> kase (id, search_id): the two halves
  // point at DIFFERENT parent columns, which is the tell.
  const client = stubClient({
    kase: [
      child('kase | case_ref .case_id', 'case_id', 'id', 'case_ref'),
      child('kase | case_ref .search_id', 'search_id', 'search_id', 'case_ref'),
    ],
  });
  await assert.rejects(() => runTraversal(client, 'kase', { forDelete: true }), CompositeKeyError);
});

test('planning a delete allows two separate foreign keys to the same table', async () => {
  // message.sender_id and message.recipient_id both -> appuser.id. Same parent
  // column, so these are two real relationships, and deleting the user means
  // deleting both sets. A blanket "same table twice" rule would wrongly block
  // this, which is why the check is on the parent column rather than the table.
  const client = stubClient({
    appuser: [
      child('appuser | message .sender_id', 'sender_id', 'id', 'message'),
      child('appuser | message .recipient_id', 'recipient_id', 'id', 'message'),
    ],
  });
  const result = await runTraversal(client, 'appuser', { forDelete: true });
  // Post-order: both message branches, then the root. The root's column is
  // the hardcoded `id` rootTableOf supplies, not a foreign key -- it has no
  // parent to have one.
  assert.deepEqual(
    result.nodes.map(n => n.column),
    ['sender_id', 'recipient_id', 'id'],
  );
});

test('counting is not blocked by a composite foreign key', async () => {
  // Counting only reads. Its numbers are inflated by the same split join --
  // a 3-row table can report 4 -- but that is wrong information, not a
  // destructive act, so it is reported rather than refused.
  const client = stubClient({
    kase: [
      child('kase | case_ref .case_id', 'case_id', 'id', 'case_ref'),
      child('kase | case_ref .search_id', 'search_id', 'search_id', 'case_ref'),
    ],
  });
  const result = await runTraversal(client, 'kase', {});
  assert.equal(result.nodes.length, 3);
});
