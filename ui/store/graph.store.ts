import { makeAutoObservable } from 'mobx';
import { Metadata, PineEdge, PineNode, PineNodeData } from '../model';
import { edges as dummyEdges, nodes as dummyNodes } from './dummy-graph';
import { Context, Hints, QualifiedTable } from './http';

type N = QualifiedTable;
type E = {
  from: N;
  to: N;
};

const makeNodeId = ({ schema, table }: N) => `${schema}.${table}`;
const makeEdgeId = ({ from, to }: E) => {
  const { schema, table } = from;
  const { schema: fSchema, table: fTable } = to;
  return `${schema}.${table} -> ${fSchema}.${fTable}`;
};

// Generate a pallette of constrasting modern colors
const Colors = ['#ff4e50', '#ff9f51', '#ffea51', '#4caf50', '#64b6ac'];

const makeNode = (n: QualifiedTable, type: 'selected' | 'suggested'): PineNode => {
  const { schema, table } = n;
  // TODO: this probably has collisions. Keep track of the schemas and the colors assigned and avoid collisions.
  const hash = n.schema.split('').reduce((acc, x) => acc + x.charCodeAt(0), 0);
  const color = schema === 'public' ? '#FFF' : Colors[hash % Colors.length];

  return {
    id: makeNodeId(n),
    type: 'pineNode',
    data: {
      schema,
      table,
      type,
      color,
    },
    position: { x: 0, y: 0 },
  };
};

const makeSelectedNode = (n: QualifiedTable): PineNode => {
  const node = makeNode(n, 'selected');
  return node;
};

const makeSuggestedNode = (n: QualifiedTable): PineNode => {
  const node = makeNode(n, 'suggested');
  return node;
};

const makeEdge = (metadata: Metadata, from: N, to: N, animated = false): PineEdge | undefined => {
  let x, y;
  const tables = metadata['db/references'].table;
  // TODO: use the schema to check the conditions instead of just the tables
  if (
    tables[from.table] &&
    tables[from.table]['refers-to'] &&
    tables[from.table]['refers-to'][to.table]
  ) {
    x = from;
    y = to;
  } else if (
    tables[to.table] &&
    tables[to.table]['refers-to'] &&
    tables[to.table]['refers-to'][from.table]
  ) {
    x = to;
    y = from;
  } else {
    return;
  }
  const e = { from: y, to: x };
  return {
    id: makeEdgeId(e),
    source: makeNodeId(e.from),
    target: makeNodeId(e.to),
    animated,
  };
};

let indexedEdges: {
  [id: string]: PineEdge;
} = {};

export class GraphStore {
  nodes: PineNode[] = [];
  edges: PineEdge[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  loadDummyNodesAndEdges = async () => {
    this.nodes = dummyNodes.map(x => ({ ...x, selectable: false }));
    this.edges = dummyEdges.map(e => ({ ...e, selectable: false, animated: false }));
  };

  convertHintsToGraph = (metadata: Metadata, hints: Hints, context: Context) => {
    const tableHints = hints.table || [];
    const selected = context ? context.map(makeSelectedNode) : [];
    const suggested = tableHints.map(makeSuggestedNode);
    this.nodes = selected.concat(suggested);

    if (context.length < 1) {
      indexedEdges = {};
      this.edges = [];
      return;
    }

    const [x, y] = context.reverse();
    if (y) {
      const edge = makeEdge(metadata, y, x, false);
      if (edge && !indexedEdges[edge.id]) {
        indexedEdges[edge.id] = edge;
      }
    }

    const suggestedEdges = tableHints
      .map(h => makeEdge(metadata, x, h, true))
      .reduce(
        (acc, edge) => {
          if (!edge) return acc;
          if (!indexedEdges[edge.id] && !acc[edge.id]) {
            acc[edge.id] = edge;
          }
          return acc;
        },
        {} as { [id: string]: PineEdge },
      );

    this.edges = Object.values(indexedEdges).concat(Object.values(suggestedEdges));
  };
}
