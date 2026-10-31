// A join from a name given with `as` (pine-lang's docs/joins.md, "Joining on
// a name you give"). It can start from the elements of an `unnest:`, which
// have no node, so the canvas draws it from their table's node.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildCanvasGraph } = require('../store/canvas/layout.ts');
const { isUncertainResolution } = require('../store/graph.util.ts');

// pine-lang's /build for
// `activity | unnest: data as e | s: e.companyId as company_id | company`.
const ast = {
  'selected-tables': [
    { schema: null, table: 'activity', alias: 'a_0' },
    { schema: null, table: 'company', alias: 'c_2' },
  ],
  joins: [
    {
      from: 'e',
      to: 'c_2',
      parent: 'from',
      columns: [{ from: 'value', to: 'id', 'from-value-path': ['companyId'] }],
      resolution: 'alias',
      cast: null,
      type: null,
    },
  ],
  unnests: [
    { alias: 'e', table: 'a_0', index: 1, source: 'a_0', column: 'data', path: [], text: 'data' },
  ],
  columns: [{ column: 'value', alias: 'e', 'column-alias': 'company_id', path: ['companyId'] }],
  where: [],
  order: [],
  group: [],
  current: 'c_2',
  context: 'a_0',
};

test('a join from an element starts at its table node, at a handle named as typed', () => {
  const graph = buildCanvasGraph(ast, {}, false);
  assert.deepEqual(
    graph.nodes.map(n => n.id).sort(),
    ['a_0', 'c_2'],
    'The elements have no node of their own',
  );
  const [edge] = graph.edges;
  assert.equal(edge.source, 'a_0');
  assert.equal(edge.target, 'c_2');
  assert.equal(edge.sourceHandle, 'r:e.companyId');
  assert.equal(edge.targetHandle, 'l:id');
  assert.equal(edge.uncertain, true, 'The query says what the values are, not the schema');
});

test('a join from a key inside a JSON column is named by its path', () => {
  const graph = buildCanvasGraph(
    {
      ...ast,
      joins: [
        {
          ...ast.joins[0],
          from: 'a_0',
          columns: [{ from: 'data', to: 'id', 'from-value-path': ['ownerId'] }],
        },
      ],
      unnests: [],
      columns: [],
    },
    {},
    false,
  );
  assert.equal(graph.edges[0].sourceHandle, 'r:data.ownerId');
});

test('an alias join is drawn as uncertain wherever joins are styled', () => {
  assert.equal(isUncertainResolution('alias'), true);
  assert.equal(isUncertainResolution('fk'), false);
});
