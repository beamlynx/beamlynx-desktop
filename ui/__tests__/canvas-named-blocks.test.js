// Earlier query blocks ending in `|= name`: nested queries of the last
// block, drawn on the canvas with the same pill and one-expanded rule as
// checkpoints. The ASTs are pine-lang's own /build output
// (fixtures/named-block-asts.json, from its :test schema).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const asts = require('./fixtures/named-block-asts.json');
const { blockName, contextFor, replaceQuery, tabBlocks } = require('../store/canvas/tab-blocks.ts');
const { buildCanvasGraph } = require('../store/canvas/layout.ts');

const TAB = '$n = 1\n\ncompany as c | where: id = 1 | limit: 10 |= top\n\ntop | employee as e';

test('a block ending in |= name is named, however it is written', () => {
  assert.equal(blockName('company |= top'), 'top');
  assert.equal(blockName('company\n | limit: 10\n | = top'), 'top');
  assert.equal(blockName('company |= top -- the top ten'), 'top');
  assert.equal(blockName('company |= top | where: id = 1'), null);
});

test('the tab splits into values blocks, named blocks and the last query', () => {
  const tab = tabBlocks(TAB);
  assert.deepEqual(tab.queries, [1, 2]);
  assert.deepEqual(tab.names, ['top', null]);
  // A block builds with everything above it.
  assert.deepEqual(contextFor(tab, 0), ['$n = 1']);
  assert.deepEqual(contextFor(tab, 1), [
    '$n = 1',
    'company as c | where: id = 1 | limit: 10 |= top',
  ]);
  // An earlier query without a name is a query of its own.
  assert.deepEqual(tabBlocks('company\n\nemployee').names, [null, null]);
  // A values block can come after the last query.
  assert.deepEqual(tabBlocks('company\n\n$n = 1').queries, [0]);
});

test('a gesture rewrites only its own block', () => {
  const tab = tabBlocks(TAB);
  assert.equal(
    replaceQuery(TAB, tab, 0, 'company as c\n | limit: 5\n | = top'),
    '$n = 1\n\ncompany as c\n | limit: 5\n | = top\n\ntop | employee as e',
  );
  assert.equal(
    replaceQuery(TAB, tab, 1, 'top | employee as e | s: e.id'),
    TAB.replace('employee as e', 'employee as e | s: e.id'),
  );
});

const blocks = [{ name: 'top', prefix: 'b0/', ast: asts.block }];

test('collapsed: the node using the block says so, the block is not drawn', () => {
  const graph = buildCanvasGraph(asts.main, {}, undefined, blocks);
  const ids = graph.nodes.map(n => n.id);
  assert.ok(!ids.some(id => id.startsWith('b0/') || id.startsWith('container:')));
  const top = graph.nodes.find(n => n.id === 'top');
  // The block ends in a limit named top: the label says both.
  assert.deepEqual(top.data.nested, {
    kind: 'named',
    name: 'top',
    label: 'limit 10 |= top',
    expanded: false,
  });
});

test('expanded: the block is drawn above, in a container, with its own node ids and chips', () => {
  const graph = buildCanvasGraph(asts.main, {}, 'top', blocks);
  const c = graph.nodes.find(n => n.id === 'b0/c');
  assert.ok(c, "the block's table is drawn, prefixed");
  assert.deepEqual(c.data.whereChips, ['id = 1']);
  // Its own trailing checkpoint isn't drawn twice: top is the last block's node.
  assert.ok(!graph.nodes.some(n => n.id === 'b0/top'));
  const container = graph.nodes.find(n => n.id === 'container:top');
  assert.equal(container.data.kind, 'named');
  assert.ok(container.position.y < c.position.y);
  assert.ok(
    container.position.y + container.data.height <
      graph.nodes.find(n => n.id === 'top').position.y + 28,
  );
});

test('a named block the last query does not join has no node, only a container while expanded', () => {
  const blocks = [{ name: 'other', prefix: 'b0/', ast: asts.block }];
  const lineage = lineageOf(
    [
      { name: 'other', text: 'company |= other' },
      { name: null, text: 'company | where: id in other' },
    ],
    1,
  );
  const collapsed = buildCanvasGraph(asts.block, {}, undefined, blocks, lineage);
  // The strip shows it.
  assert.ok(collapsed.nodes.some(n => n.id === 'lineage:0'));
  assert.ok(!collapsed.nodes.some(n => n.id === 'container:other'));
  const open = buildCanvasGraph(asts.block, {}, 'other', blocks, lineage);
  assert.ok(!open.nodes.some(n => n.id === 'named:other'));
  const container = open.nodes.find(n => n.id === 'container:other');
  assert.equal(container.data.connector, 0);
  // It stands above the graph.
  const below = open.nodes.filter(n => n.type === 'table-node' && !n.id.startsWith('b0/'));
  for (const n of below) assert.ok(container.position.y + container.data.height < n.position.y);
});
const { blockUses, lineageOf } = require('../store/canvas/lineage.ts');

test('a block reads an earlier one as a table, or as a set after in', () => {
  const earlier = ['sp_docs', 'grouped', 'edited', 'keep'];
  assert.deepEqual(blockUses('sp_docs as s | select: s.*', earlier), [{ name: 'sp_docs', use: 'table' }]);
  assert.deepEqual(blockUses('company_document as d\n | grouped as g .id = .id', earlier), [
    { name: 'grouped', use: 'table' },
  ]);
  assert.deepEqual(blockUses('grouped as g | select: g.*, id in edited as was_edited', earlier), [
    { name: 'grouped', use: 'table' },
    { name: 'edited', use: 'in' },
  ]);
  assert.deepEqual(blockUses('d | where: id not in keep', earlier), [{ name: 'keep', use: 'in' }]);
  // Not a use: a column, an operation, another schema's table, a string, a comment.
  assert.deepEqual(
    blockUses("company | where: grouped = 'keep' | s: edited, c.grouped | public.sp_docs -- in keep", earlier),
    [],
  );
});

// The motivating dedupe script, as its blocks.
const DEDUPE = [
  { name: 'sp_docs', text: 'company_document as d | where: d.deleted_at is null |= sp_docs' },
  { name: 'grouped', text: 'sp_docs as s | select: s.*, coalesce(reference_id, id) as dedupe_key |= grouped' },
  { name: 'edited', text: 'grouped as g | activity_resource as ar .resourceableId = .id ::text | select: g.id |= edited' },
  { name: 'ranked', text: 'grouped as g | select: g.*, id in edited as has_activity | limit: 1 per company_id |= ranked' },
  { name: 'keep_final', text: 'ranked | select: id |= keep_final' },
];
const DEDUPE_MAIN = 'company_document as d | grouped as g .id = .id | where: id not in keep_final | from: d | update! deleted_at = now()';

test('the lineage of a script: each block points at what is made from it', () => {
  const lineage = lineageOf([...DEDUPE, { name: null, text: DEDUPE_MAIN }], 5);
  assert.deepEqual(
    lineage.blocks.map(b => [b.id, b.label, b.write]),
    [
      ['0', '|= sp_docs', false],
      ['1', '|= grouped', false],
      ['2', '|= edited', false],
      ['3', '|= ranked', false],
      ['4', '|= keep_final', false],
      ['5', '6', true],
    ],
  );
  assert.deepEqual(lineage.edges, [
    { from: '0', to: '1', use: 'table' },
    { from: '1', to: '2', use: 'table' },
    { from: '1', to: '3', use: 'table' },
    { from: '2', to: '3', use: 'in' },
    { from: '3', to: '4', use: 'table' },
    { from: '1', to: '5', use: 'table' },
    { from: '4', to: '5', use: 'in' },
  ]);
});

test('a name used twice: a block reads the nearest one above it', () => {
  const lineage = lineageOf(
    [
      { name: 'x', text: 'company |= x' },
      { name: 'x', text: 'x | limit: 1 |= x' },
      { name: null, text: 'x | employee' },
    ],
    2,
  );
  assert.deepEqual(lineage.edges.map(e => [e.from, e.to]), [
    ['0', '1'],
    ['1', '2'],
  ]);
});

const TWO = [
  { name: 'top', text: 'company as c | limit: 10 |= top' },
  { name: null, text: 'top | employee as e' },
];

test('the lineage strip sits above the join graph, its arrows apart from the joins', () => {
  const lineage = lineageOf(TWO, 1);
  const graph = buildCanvasGraph(asts.main, {}, undefined, blocks, lineage);
  const chips = graph.nodes.filter(n => n.type === 'lineage-node');
  assert.deepEqual(
    chips.map(n => [n.id, n.data.label, n.data.detail, n.data.active]),
    [
      ['lineage:0', '|= top', 'limit 10', false],
      ['lineage:1', '2', undefined, true],
    ],
  );
  const arrow = graph.edges.find(e => e.derivation);
  assert.deepEqual([arrow.source, arrow.target, arrow.derivation], ['lineage:0', 'lineage:1', 'table']);
  // Every table is below the strip.
  const stripBottom = Math.max(...chips.map(n => n.position.y + n.data.height));
  for (const n of graph.nodes.filter(n => n.type === 'table-node')) assert.ok(n.position.y > stripBottom);
  // The chip of the expanded block says so.
  const open = buildCanvasGraph(asts.main, {}, 'top', blocks, lineage);
  assert.equal(open.nodes.find(n => n.id === 'lineage:0').data.expanded, true);
  // One query block: no strip.
  assert.ok(!buildCanvasGraph(asts.main, {}).nodes.some(n => n.type === 'lineage-node'));
});

test('a dragged chip keeps its place, and the tables make room for it', () => {
  const lineage = lineageOf(TWO, 1);
  const laid = buildCanvasGraph(asts.main, {}, undefined, blocks, lineage);
  const tables = g => g.nodes.filter(n => n.type === 'table-node').map(n => n.position);
  // Along the strip: kept, and nothing else moves.
  const along = buildCanvasGraph(asts.main, { 'lineage:0': { x: 300, y: 0 } }, undefined, blocks, lineage);
  assert.deepEqual(along.nodes.find(n => n.id === 'lineage:0').position, { x: 300, y: 0 });
  assert.deepEqual(tables(along), tables(laid));
  // Well down: kept, and every table is below it.
  const down = buildCanvasGraph(asts.main, { 'lineage:0': { x: 300, y: 200 } }, undefined, blocks, lineage);
  const chip = down.nodes.find(n => n.id === 'lineage:0');
  assert.deepEqual(chip.position, { x: 300, y: 200 });
  for (const p of tables(down)) assert.ok(p.y > chip.position.y + chip.data.height);
});
