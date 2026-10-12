// Checkpoints on the canvas: stages stacked top to bottom, a divider per
// checkpoint, and a node named after it. The ASTs are pine-lang's own /build
// output (fixtures/checkpoint-asts.json, from its :test schema).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const asts = require('./fixtures/checkpoint-asts.json');
const { buildCanvasGraph, checkpointLabel } = require('../store/canvas/layout.ts');
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
    'group t.title → count',
  );
});

test('two checkpoints: three stages, two dividers, each checkpoint node above the tables joined onto it', () => {
  const graph = buildCanvasGraph(asts[TWO], {});
  const tables = graph.nodes.filter(n => n.type === 'table-node');
  const dividers = graph.nodes.filter(n => n.type === 'checkpoint-divider');

  // Every table once, in pipe order, with the checkpoints' nodes between.
  assert.deepEqual(
    tables.sort((a, b) => a.data.order - b.data.order).map(n => n.id),
    ['c', 'e', 'result_1', 'd', 'result_2'],
  );
  assert.deepEqual(
    dividers.map(n => n.data.label),
    ['limit 10', 'limit 5'],
  );

  const y = id => graph.nodes.find(n => n.id === id).position.y;
  const dividerY = name => dividers.find(n => n.data.name === name).position.y;
  // Stage 1 (c, e) | divider | stage 2 (result_1, d) | divider | result_2
  assert.ok(y('e') < dividerY('result_1'));
  assert.ok(dividerY('result_1') < y('result_1'));
  assert.ok(y('d') < dividerY('result_2'));
  assert.ok(dividerY('result_2') < y('result_2'));

  // The checkpoint's node lists its result's columns, and d joins onto it.
  const r1 = tables.find(n => n.id === 'result_1').data;
  assert.deepEqual(r1.checkpoint.columns, ['id', 'company_id', 'reports_to']);
  assert.equal(r1.removable, false);
  assert.ok(graph.edges.some(e => e.source === 'result_1' && e.target === 'd'));
  // A table inside a sealed checkpoint can't be removed; one after it can.
  assert.equal(tables.find(n => n.id === 'c').data.removable, false);
  assert.equal(tables.find(n => n.id === 'd').data.removable, true);
});

test('a trailing checkpoint still gets its divider and node', () => {
  const graph = buildCanvasGraph(asts[GROUP], {});
  const node = graph.nodes.find(n => n.id === 'result_1');
  assert.deepEqual(node.data.checkpoint.columns, ['name', 'count']);
  assert.deepEqual(
    graph.nodes.filter(n => n.type === 'checkpoint-divider').map(n => n.data.label),
    ['group c.name → count'],
  );
  // The group chip stays on the table it groups.
  assert.deepEqual(graph.nodes.find(n => n.id === 'c').data.groupChips, ['name']);
});

test('chips before a checkpoint stay on the table, chips after it go on its node', () => {
  const graph = buildCanvasGraph(asts[AFTER], {});
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
