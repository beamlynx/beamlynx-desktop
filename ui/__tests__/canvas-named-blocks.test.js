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
  // An earlier query without a name can't be drawn: the banner.
  assert.equal(tabBlocks('company\n\nemployee'), null);
  // Nor a values block after the last query.
  assert.equal(tabBlocks('company\n\n$n = 1'), null);
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

test('a named block nothing joins is a standalone node', () => {
  const graph = buildCanvasGraph(asts.block, {}, undefined, [
    { name: 'other', prefix: 'b0/', ast: asts.block },
  ]);
  const node = graph.nodes.find(n => n.id === 'named:other');
  assert.equal(node.data.nested.standalone, true);
});
