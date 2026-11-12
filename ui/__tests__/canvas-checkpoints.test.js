// Checkpoints on the canvas: stages stacked top to bottom, with a dotted line
// for each checkpoint, named after it. The ASTs are pine-lang's own /build
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

test('every stage is drawn, top to bottom, with a line for each checkpoint', () => {
  // Whatever was expanded before: nothing collapses any more (beamlynx-plans #33).
  for (const expanded of [undefined, null, 'result_1', 'result_2']) {
    const graph = buildCanvasGraph(asts[TWO], {}, expanded);
    const node = id => graph.nodes.find(n => n.id === id);

    // Every table once, in pipe order, with each checkpoint's line between.
    assert.deepEqual(
      graph.nodes.filter(n => n.type === 'table-node').sort((a, b) => a.data.order - b.data.order).map(n => n.id),
      ['c', 'e', 'result_1', 'd', 'result_2'],
    );
    // No boxes around a sealed stage.
    assert.equal(graph.nodes.filter(n => n.type === 'nested-container').length, 0);

    // A line is below the stage it seals and above the next one.
    const y = id => node(id).position.y;
    assert.ok(y('e') < y('result_1') && y('result_1') < y('d') && y('d') < y('result_2'));

    // It spans the graph: from left of the leftmost table to right of the rightmost.
    const line = node('result_1');
    const tables = ['c', 'e', 'd'].map(node);
    assert.ok(line.data.checkpoint.line);
    assert.ok(line.position.x < Math.min(...tables.map(n => n.position.x)));
    assert.ok(
      line.position.x + line.data.checkpoint.line.width > Math.max(...tables.map(n => n.position.x + 190)),
    );
    assert.equal(line.draggable, false);

    // It says what it does, and d joins onto it.
    assert.equal(line.data.nested.label, 'limit 10');
    assert.equal(line.data.nested.limit, 10);
    assert.equal(line.data.removable, false);
    assert.ok(graph.edges.some(e => e.source === 'result_1' && e.target === 'd'));
    // A table inside a sealed stage can't be removed; one after it can.
    assert.equal(node('c').data.removable, false);
    assert.equal(node('d').data.removable, true);
  }
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

test('a trailing checkpoint is a line under the tables it groups', () => {
  const graph = buildCanvasGraph(asts[GROUP], {}, undefined);
  const line = graph.nodes.find(n => n.id === 'result_1');
  const c = graph.nodes.find(n => n.id === 'c');
  assert.ok(line.data.checkpoint.line);
  assert.equal(line.data.nested.label, 'group c.name with count');
  assert.ok(line.position.y > c.position.y);
  // The group chip stays on the table it groups.
  assert.deepEqual(c.data.groupChips, ['name']);
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

test('adding a limit focuses the new checkpoint, drawn under the table it seals', async () => {
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
      ['c', 'result_1'],
    );
    stop();
  } finally {
    global.fetch = original;
  }
});
