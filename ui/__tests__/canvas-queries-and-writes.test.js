// A tab with several queries of their own: the canvas draws the one under
// the cursor. A query ending in update! or delete! shows what it changes on
// the table it changes, and one ending in describe: or references: the table
// it describes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const asts = require('./fixtures/named-block-asts.json');
const { mainQuery, tabBlocks } = require('../store/canvas/tab-blocks.ts');
const { describeOf, withoutDescribe, withoutDescribeSegments, writeOf } = require('../store/canvas/pine-text.ts');
const { describeTable } = require('../store/canvas/pine-actions.ts');
const { buildCanvasGraph } = require('../store/canvas/layout.ts');
const { lineageOf } = require('../store/canvas/lineage.ts');

const TAB = [
  "company as c | where: c.id = 1 | update! name = 'a, b', updated_at = now()",
  '',
  'company as c | limit: 10 |= top',
  '',
  'top | employee as e | delete! .id',
  '',
  '$n = 1',
].join('\n');

test('the canvas draws the query under the cursor', () => {
  const tab = tabBlocks(TAB);
  assert.deepEqual(tab.names, [null, 'top', null]);
  assert.equal(mainQuery(tab, 0), 0);
  // A named block is drawn on its own too.
  assert.equal(mainQuery(tab, 2), 1);
  assert.equal(mainQuery(tab, 4), 2);
  // In a values block below the last query: that query.
  assert.equal(mainQuery(tab, 6), 2);
  // No cursor: the last query.
  assert.equal(mainQuery(tab, undefined), 2);
});

const segment = (text, kind, owner) => ({ text, start: 0, end: 0, kind, owner });

test('an update! lists what it writes, a delete! the columns that find the rows', () => {
  assert.deepEqual(
    writeOf([
      segment('company as c', 'table', 'c'),
      segment("update! name = 'a, b', updated_at = coalesce(x, now())", 'update', 'c'),
    ]),
    { kind: 'update', alias: 'c', items: ["name = 'a, b'", 'updated_at = coalesce(x, now())'] },
  );
  assert.deepEqual(writeOf([segment('employee as e', 'table', 'e'), segment('d! .id, .company_id', 'delete-action', 'e')]), {
    kind: 'delete',
    alias: 'e',
    items: ['id', 'company_id'],
  });
  // Only a write that ends the query counts.
  assert.equal(writeOf([segment('delete! .id', 'delete-action', 'e'), segment('select: id', 'select', 'e')]), null);
  assert.equal(writeOf(null), null);
});

test('the table a write changes carries it, and only that table', () => {
  const blocks = [{ name: 'top', prefix: 'b0/', ast: asts.block }];
  const graph = buildCanvasGraph(asts.main, {}, undefined, blocks, undefined, {
    kind: 'delete',
    alias: 'e',
    items: ['id'],
  });
  const written = graph.nodes.filter(n => n.data && n.data.write);
  assert.deepEqual(
    written.map(n => [n.id, n.data.write]),
    [['e', { kind: 'delete', items: ['id'] }]],
  );
});

// describe: and references: stay in the tab, shown on the table they
// describe, the way a write is.
test('a describe: or references: names the table the pipe left off at', () => {
  assert.deepEqual(
    describeOf([segment('company as c', 'table', 'c'), segment('employee as e', 'table', 'e'), segment('describe:', 'describe', 'e')]),
    { kind: 'describe', alias: 'e' },
  );
  assert.deepEqual(
    describeOf([segment('company as c', 'table', 'c'), segment('from: c', 'from', 'c'), segment('references:', 'references', 'c')]),
    { kind: 'references', alias: 'c' },
  );
  assert.equal(describeOf([segment('company as c', 'table', 'c')]), null);
});

test('the table a describe: describes carries it', () => {
  const blocks = [{ name: 'top', prefix: 'b0/', ast: asts.block }];
  const graph = buildCanvasGraph(asts.main, {}, undefined, blocks, undefined, null, { kind: 'references', alias: 'e' });
  const described = graph.nodes.filter(n => n.data && n.data.describe);
  assert.deepEqual(
    described.map(n => [n.id, n.data.describe]),
    [['e', 'references']],
  );
});

test('a gesture works on the query without its describe step', () => {
  assert.equal(withoutDescribe('company as c | employee as e | describe:'), 'company as c | employee as e');
  assert.equal(withoutDescribe('company as c | employee as e | from: c | references: '), 'company as c | employee as e');
  assert.equal(withoutDescribe('company as c\n  | f: c\n  | describe:'), 'company as c');
  assert.equal(withoutDescribe('company as c | where: id = 1'), 'company as c | where: id = 1');
  // A picker's probe builds on segments the same way.
  const pipe = [segment('company as c', 'table', 'c'), segment('employee as e', 'table', 'e')];
  assert.deepEqual(withoutDescribeSegments([...pipe, segment('from: c', 'from', 'c'), segment('describe:', 'describe', 'c')]), pipe);
  assert.deepEqual(withoutDescribeSegments([...pipe, segment('references:', 'references', 'e')]), pipe);
  assert.deepEqual(withoutDescribeSegments(pipe), pipe);
});

test('describing a table adds from: only when the pipe ends at another one', () => {
  const base = segments => ({ segments });
  const pipe = [segment('company as c', 'table', 'c'), segment('employee as e', 'table', 'e')];
  assert.equal(describeTable(base(pipe), 'describe', 'e'), 'company as c | employee as e | describe:');
  assert.equal(describeTable(base(pipe), 'references', 'c'), 'company as c | employee as e | from: c | references:');
});

test('a tab of queries of their own: a chip for each, numbered, the drawn one active', () => {
  const lineage = lineageOf(
    [
      { name: null, text: "company as c | update! name = 'x'" },
      { name: null, text: 'company as c | employee as e | delete! .id' },
    ],
    0,
  );
  assert.deepEqual(lineage.edges, []);
  const chips = buildCanvasGraph(asts.main, {}, undefined, [], lineage).nodes.filter(n => n.type === 'lineage-node');
  assert.deepEqual(
    chips.map(n => [n.data.label, n.data.active, n.data.write]),
    [
      ['1', true, true],
      ['2', false, true],
    ],
  );
});
