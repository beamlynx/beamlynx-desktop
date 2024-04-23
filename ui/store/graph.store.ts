import { makeAutoObservable } from 'mobx';
import { Metadata, PineEdge, PineNode, PineNodeData } from '../model';
import { edges as dummyEdges, nodes as dummyNodes } from './dummy-graph';
import { Hints, QualifiedTable } from './http';

type N = QualifiedTable;
type E = {
  from: N;
  to: N;
};

const makeNodeId = ({ schema, table, alias }: N) => alias ?? `${schema}.${table}`;
const makeEdgeId = ({ from, to }: E) => {
  return `${makeNodeId(from)} -> ${makeNodeId(to)}`;
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

let edgeLookup: {
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

  convertHintsToGraph = (
    metadata: Metadata,
    context: QualifiedTable[],
    hints: QualifiedTable[],
  ) => {
    // Create nodes for the selected and suggested tables
    const selected: PineNode[] = context ? context.map(x => makeNode(x, 'selected')) : [];
    const suggested: PineNode[] = hints ? hints.map(x => makeNode(x, 'suggested')) : [];
    this.nodes = selected.concat(suggested);

    // If there are no selected tables, there are no edges
    if (context.length < 1) {
      this.edges = [];
      return;
    }

    // The context is an array of objects e.g. [ {schema: 'public', table: 'users'}, {schema: 'public', table: 'orders'}]
    // Create pairs of items from the context e.g. [ x, y, z] => [ [x, y], [x, z], [y, z] ]

    const pairs = context.reduce(
      (acc: [QualifiedTable, QualifiedTable][], current, index, array) => {
        if (index < array.length - 1) {
          // Check to ensure we don't go out of bounds
          acc.push([current, array[index + 1]]);
        }
        return acc;
      },
      [],
    );

    const selectedEdges = pairs
      .map(([x, y]) => makeEdge(metadata, x, y, false))
      .filter(Boolean) as PineEdge[];

    const [x] = context.reverse();

    const suggestedEdges = hints
      .map(h => makeEdge(metadata, x, h, true))
      .filter(Boolean) as PineEdge[];

    const edgeLookup = selectedEdges.concat(suggestedEdges).reduce(
      (acc, edge) => {
        if (!edge) return acc;
        if (!acc[edge.id]) {
          acc[edge.id] = edge;
        }
        return acc;
      },
      {} as { [id: string]: PineEdge },
    );

    this.edges = Object.values(edgeLookup);
  };
}
