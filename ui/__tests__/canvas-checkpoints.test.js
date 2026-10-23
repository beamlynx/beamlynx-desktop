// Checkpoints on the canvas: stages stacked top to bottom, a divider per
// checkpoint, and a node named after it. The ASTs are pine-lang's own /build
// output (fixtures/checkpoint-asts.json, from its :test schema).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const asts = require('./fixtures/checkpoint-asts.json');
const {
  buildCanvasGraph,
  checkpointLabel,
  newCheckpointName,
} = require('../store/canvas/layout.ts');
const {
  segmentsFromAst,
  ensureExplicitCheckpointName,
  appendOwnedSegment,
  appendTableSegment,
  pipelineTables,
  stageEnd,
  toText,
} = require('../store/canvas/pine-text.ts');
const {
  deleteCheckpoint,
  deleteNode,
  setLimit,
  setGroupColumns,
  splitGroupBody,
} = require('../store/canvas/pine-actions.ts');

const TWO =
  'company as c | employee as e .company_id | limit: 10 | = result_1 | document as d | limit: 5';
const AFTER = 'company as c | where: id = 1 | limit: 10 | where: result_1.id = 2';
const GROUP = 'company as c | group: c.name';

const segments = expression => segmentsFromAst(expression, asts[expression]);
const base = expression => ({
  expression,
  ast: asts[expression],
  segments: segments(expression),
  aliasMap: new Map(),
});

test('labels say what the checkpoint does', () => {
  assert.equal(checkpointLabel({ kind: 'limit', limit: 10 }), 'limit 10');
  assert.equal(
    checkpointLabel({
      kind: 'limit',
      limit: 1,
      per: [
        { alias: 'c', column: 'id' },
        { alias: 'c', column: 'data', path: ['region'] },
      ],
    }),
    'limit 1 per c.id, c.data.region',
  );
  assert.equal(
    checkpointLabel({
      kind: 'group',
      group: [{ alias: 't', column: 'title' }],
      aggregates: ['count'],
    }),
    'group t.title with count',
  );
});

test('two checkpoints, all expanded: nested containers, each above its node', () => {
  const graph = buildCanvasGraph(asts[TWO], {}, 'result_1');
  const tables = graph.nodes.filter(n => n.type === 'table-node');
  const containers = graph.nodes.filter(n => n.type === 'nested-container');

  // Every table once, in pipe order, with the checkpoints' nodes between.
  assert.deepEqual(
    tables.sort((a, b) => a.data.order - b.data.order).map(n => n.id),
    ['c', 'e', 'result_1', 'd', 'result_2'],
  );
  // No divider lines: a container per expanded checkpoint.
  assert.deepEqual(
    containers.map(n => [n.data.name, n.data.label]),
    [
      ['result_1', 'limit 10'],
      ['result_2', 'limit 5'],
    ],
  );

  const node = id => graph.nodes.find(n => n.id === id);
  const box = name => {
    const c = containers.find(n => n.data.name === name);
    return {
      x0: c.position.x,
      y0: c.position.y,
      x1: c.position.x + c.data.width,
      y1: c.position.y + c.data.height,
      c,
    };
  };
  const inside = (b, id) => {
    const n = node(id);
    return (
      n.position.x >= b.x0 &&
      n.position.x + 190 <= b.x1 &&
      n.position.y >= b.y0 &&
      n.position.y <= b.y1
    );
  };
  const r1 = box('result_1');
  const r2 = box('result_2');
  // result_1's box holds c and e, and sits right above result_1's node.
  assert.ok(inside(r1, 'c') && inside(r1, 'e'));
  assert.ok(!inside(r1, 'result_1'));
  assert.ok(r1.y1 < node('result_1').position.y + 28);
  // result_2's box holds result_1's box, its node and d: they nest.
  assert.ok(r2.x0 < r1.x0 && r2.y0 < r1.y0 && r2.y1 > r1.y1);
  assert.ok(inside(r2, 'result_1') && inside(r2, 'd'));
  assert.ok(!inside(r2, 'result_2'));
  // The connector runs from the box's bottom edge to the node's box, at its centre.
  assert.equal(r1.c.data.connectorX, node('result_1').position.x + 95 - r1.x0);
  assert.ok(r1.c.data.connector > 0 && r1.c.data.connector < 60);

  // Drawn like a table, saying what it is; not removable, d joins onto it.
  const d1 = node('result_1').data;
  assert.deepEqual(d1.nested, {
    kind: 'checkpoint',
    name: 'result_1',
    label: 'limit 10',
    limit: 10,
    expanded: true,
  });
  assert.equal(d1.removable, false);
  assert.ok(graph.edges.some(e => e.source === 'result_1' && e.target === 'd'));
  // A table inside a sealed checkpoint can't be removed; one after it can.
  assert.equal(node('c').data.removable, false);
  assert.equal(node('d').data.removable, true);
});

test('by default everything is collapsed: only the last stage, no containers', () => {
  for (const expanded of [undefined, null]) {
    const graph = buildCanvasGraph(asts[TWO], {}, expanded);
    assert.deepEqual(
      graph.nodes.map(n => n.id),
      ['result_2'],
    );
    assert.deepEqual(graph.nodes[0].data.nested, {
      kind: 'checkpoint',
      name: 'result_2',
      label: 'limit 5',
      limit: 5,
      expanded: false,
    });
  }
});

test('expanding the last checkpoint shows the stage it seals, with the earlier one collapsed', () => {
  const graph = buildCanvasGraph(asts[TWO], {}, 'result_2');
  const ids = graph.nodes.filter(n => n.type === 'table-node').map(n => n.id);
  assert.deepEqual(ids.sort(), ['d', 'result_1', 'result_2']);
  assert.equal(graph.nodes.find(n => n.id === 'result_1').data.nested.expanded, false);
  assert.deepEqual(
    graph.nodes.filter(n => n.type === 'nested-container').map(n => n.data.name),
    ['result_2'],
  );
});

test('the checkpoint a gesture adds is found by name', () => {
  const c1 = { name: 'result_1' };
  const c2 = { name: 'result_2' };
  assert.equal(newCheckpointName([], [c1]), 'result_1');
  assert.equal(newCheckpointName([c1], [c1, c2]), 'result_2');
  assert.equal(newCheckpointName(undefined, [c1]), 'result_1');
  // Changing or removing one isn't adding one.
  assert.equal(newCheckpointName([c1], [c1]), null);
  assert.equal(newCheckpointName([c1, c2], [c1]), null);
});

test('a trailing checkpoint, expanded, holds the tables it groups', () => {
  const graph = buildCanvasGraph(asts[GROUP], {}, 'result_1');
  const node = graph.nodes.find(n => n.id === 'result_1');
  assert.equal(node.data.nested.expanded, true);
  assert.deepEqual(
    graph.nodes.filter(n => n.type === 'nested-container').map(n => n.data.label),
    ['group c.name with count'],
  );
  // The group chip stays on the table it groups.
  assert.deepEqual(graph.nodes.find(n => n.id === 'c').data.groupChips, ['name']);
});

test('chips before a checkpoint stay on the table, chips after it go on its node', () => {
  const graph = buildCanvasGraph(asts[AFTER], {}, 'result_1');
  assert.deepEqual(graph.nodes.find(n => n.id === 'c').data.whereChips, ['id = 1']);
  assert.deepEqual(graph.nodes.find(n => n.id === 'result_1').data.whereChips, ['id = 2']);
});

test("every stage's tables are found, not just the last one's", () => {
  assert.deepEqual(
    pipelineTables(asts[TWO]).map(t => t.alias),
    ['c', 'e', 'd'],
  );
});

test("a checkpoint's step belongs to its name, and so does what follows it", () => {
  assert.deepEqual(
    segments(AFTER).map(s => s.owner),
    ['c', 'c', 'result_1', 'result_1'],
  );
  assert.deepEqual(
    segments(TWO).map(s => s.owner),
    ['c', 'e', 'result_1', 'result_1', 'd', 'result_2'],
  );
});

test('a gesture on a table lands in its own stage', () => {
  // A where on c goes before the first checkpoint, not after it.
  assert.equal(
    toText(appendOwnedSegment(segments(TWO), 'c', 'where', 'where: c.id = 3')),
    'company as c | where: c.id = 3 | employee as e .company_id | limit: 10 | = result_1 | document as d | limit: 5',
  );
  // A where on a checkpoint's node goes after it.
  assert.equal(
    toText(appendOwnedSegment(segments(TWO), 'result_1', 'where', 'where: result_1.id = 3')),
    'company as c | employee as e .company_id | limit: 10 | = result_1 | where: result_1.id = 3 | document as d | limit: 5',
  );
  // A join from e lands before the checkpoint that seals e; one from the
  // checkpoint's node lands after it.
  assert.equal(stageEnd(segments(TWO), 'e'), 2);
  assert.equal(
    toText(appendTableSegment(segments(GROUP), 'employee', 'e', undefined, 'c')),
    'company as c | employee as e | group: c.name',
  );
  assert.equal(
    toText(appendTableSegment(segments(GROUP), 'employee', 'e', undefined, 'result_1')),
    'company as c | group: c.name | employee as e',
  );
});

test('pinning writes the name pine-lang reports, on every unnamed checkpoint', () => {
  const pinned = ensureExplicitCheckpointName(segments(TWO));
  assert.equal(pinned.changed, true);
  assert.equal(
    toText(pinned.segments),
    'company as c | employee as e .company_id | limit: 10 | = result_1 | document as d | limit: 5 | = result_2',
  );
  assert.equal(
    toText(ensureExplicitCheckpointName(segments(GROUP)).segments),
    'company as c | group: c.name | = result_1',
  );
  // Nothing to pin twice.
  assert.equal(ensureExplicitCheckpointName(pinned.segments).changed, false);
});

test("a limit is set per stage, and a checkpoint's own limit from its divider", () => {
  // From d's stage: the limit that seals it.
  assert.equal(
    setLimit(base(TWO), 7, 'd'),
    'company as c | employee as e .company_id | limit: 10 | = result_1 | document as d | limit: 7',
  );
  // From c's stage.
  assert.equal(
    setLimit(base(TWO), 7, 'c'),
    'company as c | employee as e .company_id | limit: 7 | = result_1 | document as d | limit: 5',
  );
  // The divider's label names the checkpoint.
  assert.equal(
    setLimit(base(TWO), 3, undefined, 'result_1'),
    'company as c | employee as e .company_id | limit: 3 | = result_1 | document as d | limit: 5',
  );
  // From the trailing checkpoint's node: a new limit on its sealed result.
  assert.equal(
    setLimit(base(TWO), 2, 'result_2'),
    'company as c | employee as e .company_id | limit: 10 | = result_1 | document as d | limit: 5 | limit: 2',
  );
});

test('group: is per stage too', () => {
  assert.equal(
    setGroupColumns(base(GROUP), 'c', ['name', 'id']),
    'company as c | group: c.name, c.id',
  );
  assert.equal(setGroupColumns(base(GROUP), 'c', []), 'company as c');
});

test('a group: body splits into its keys and its aggregates at `with`', () => {
  assert.deepEqual(splitGroupBody('c.name, c.id with count, total => max as top'), {
    keys: 'c.name, c.id',
    aggregates: 'count, total => max as top',
  });
  assert.deepEqual(splitGroupBody('c.name'), { keys: 'c.name', aggregates: null });
  // A `with` inside a string is not the divider; a column named `width` isn't either.
  assert.deepEqual(splitGroupBody("c.width with count where name = 'a with b'"), {
    keys: 'c.width',
    aggregates: "count where name = 'a with b'",
  });
});

test('a group: with no keys is one group: its body is all aggregates, and its label has no gap', () => {
  assert.deepEqual(splitGroupBody('with count as n, total => sum as revenue'), {
    keys: '',
    aggregates: 'count as n, total => sum as revenue',
  });
  assert.equal(
    checkpointLabel({ kind: 'group', group: [], aggregates: ['count as n'] }),
    'group with count as n',
  );
  // Grouping it by a column keeps the aggregates.
  assert.equal(
    setGroupColumns(base('company as c | group: with count as n'), 'c', ['name']),
    'company as c | group: c.name with count as n',
  );
});

test('removing a checkpoint keeps the tables after it', () => {
  assert.equal(
    deleteCheckpoint(base(TWO), 'result_1'),
    'company as c | employee as e .company_id | document as d | limit: 5',
  );
  assert.equal(deleteCheckpoint(base(AFTER), 'result_1'), 'company as c | where: id = 1');
  assert.equal(deleteCheckpoint(base(GROUP), 'result_1'), 'company as c');
});

test('a limit added from a table goes at the end, even when a group ends its stage', () => {
  // Before the group would group only 5 rows, not give the first 5 groups.
  assert.equal(setLimit(base(GROUP), 5, 'c'), 'company as c | group: c.name | limit: 5');
});

test('removing the only table before a checkpoint removes the checkpoint too', () => {
  const seg = (text, kind, owner) => ({ text, start: -1, end: -1, kind, owner });
  const plain = {
    aliasMap: new Map(),
    segments: [seg('company as c', 'table', 'c'), seg('limit: 10', 'limit', 'result_1')],
  };
  assert.equal(deleteNode(plain, 'c'), '');
  assert.equal(deleteNode(base(GROUP), 'c'), '');
  const pinned = {
    aliasMap: new Map(),
    segments: [
      seg('company as c', 'table', 'c'),
      seg('limit: 10', 'limit', 'result_1'),
      seg('= result_1', 'assign', 'result_1'),
      seg('employee as e', 'table', 'e'),
    ],
  };
  assert.equal(deleteNode(pinned, 'c'), 'employee as e');
});

// After a gesture adds a limit, focus moves to the new checkpoint's node,
// collapsed - the same way focus follows a newly joined table.
const { Session } = require('../store/session.ts');
const { CanvasStore } = require('../store/canvas/canvas.store.ts');

test('adding a limit focuses the new checkpoint, collapsed', async () => {
  const flat = text => text.replace(/\s+/g, ' ').trim();
  const original = global.fetch;
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const expression = flat(body.expressions[body.expressions.length - 1] ?? '');
    return { ok: true, json: async () => ({ ast: asts[expression] ?? null }) };
  };
  try {
    const session = new Session('focus', { connections: [], accessPolicies: [] });
    session.connectionId = 'conn-1';
    session.expression = 'company as c';
    session.ast = asts['company as c'];
    const store = new CanvasStore(session);
    const stop = store.start();
    store.focusNode('c');

    await store.commitLimit(5, 'c');
    assert.equal(flat(session.expression), 'company as c | limit: 5');
    // The build that follows the commit.
    session.ast = asts['company as c | limit: 5'];

    assert.equal(store.expandedNested, undefined);
    assert.equal(store.focusedAlias, 'result_1');
    assert.deepEqual(
      store.canvasGraph.nodes.map(n => n.id),
      ['result_1'],
    );
    stop();
  } finally {
    global.fetch = original;
  }
});
