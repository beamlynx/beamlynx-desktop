import { makeAutoObservable } from 'mobx';
import { Metadata, PineEdge, PineNode } from '../model';
import { edges as dummyEdges, nodes as dummyNodes } from './dummy-graph';
import { Hints, QualifiedTable } from './http';

type E = {
  from: PineNode;
  to: PineNode;
};

const makeNodeId = ({ schema, table, alias }: QualifiedTable) => {
  return alias ?? `${schema}.${table}`;
};
const makeEdgeId = ({ from, to }: E) => {
  return `${makeNodeId(from.data)} -> ${makeNodeId(to.data)}`;
};

// Generate a pallette of constrasting modern colors
const Colors = ['#ff4e50', '#ff9f51', '#ffea51', '#4caf50', '#64b6ac'];

const makeNode = (n: QualifiedTable, type: 'selected' | 'suggested'): PineNode => {
  const { schema, table, alias } = n;
  // TODO: this probably has collisions. Keep track of the schemas and the colors assigned and avoid collisions.
  const hash = n.schema.split('').reduce((acc, x) => acc + x.charCodeAt(0), 0);
  const color = schema === 'public' ? '#FFF' : Colors[hash % Colors.length];

  return {
    id: makeNodeId(n),
    type: 'pineNode',
    data: {
      schema,
      table,
      alias,
      type,
      color,
    },
    position: { x: 0, y: 0 },
  };
};

const makeEdge = (
  edgeLookup: { [id: string]: PineEdge },
  metadata: Metadata,
  fromNode: PineNode,
  toNode: PineNode,
): PineEdge | undefined => {
  const from = fromNode.data;
  const to = toNode.data;
  let x, y;
  const tables = metadata['db/references'].table;
  // TODO: use the schema to check the conditions instead of just the tables
  if (
    tables[from.table] &&
    tables[from.table]['refers-to'] &&
    tables[from.table]['refers-to'][to.table]
  ) {
    x = fromNode;
    y = toNode;
  } else if (
    tables[to.table] &&
    tables[to.table]['refers-to'] &&
    tables[to.table]['refers-to'][from.table]
  ) {
    x = toNode;
    y = fromNode;
  } else {
    return;
  }
  const e = { from: y, to: x };
  const id = makeEdgeId(e);
  if (edgeLookup[id]) {
    return edgeLookup[id];
  }
  const edge = {
    id,
    animated: fromNode.data.type === 'suggested' || toNode.data.type === 'suggested',
    source: makeNodeId(e.from.data),
    target: makeNodeId(e.to.data),
  };
  edgeLookup[id] = edge;
  return edge;
};

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
    // TODO: should we do this always?
    if (context.length < 1) {
      this.edges = [];
      return;
    }

    // The context is an array of objects e.g. [ {schema: 'public', table: 'users'}, {schema: 'public', table: 'orders'}]
    // Create pairs of items from the context e.g. [ x, y, z] => [ [x, y], [x, z], [y, z] ]
    const pairs = selected.reduce((acc: [PineNode, PineNode][], current, index, array) => {
      if (index < array.length - 1) {
        // Check to ensure we don't go out of bounds
        acc.push([current, array[index + 1]]);
      }
      return acc;
    }, []);

    const edgeLookup = {};

    const selectedEdges = pairs
      .map(([x, y]) => makeEdge(edgeLookup, metadata, x, y))
      .filter(Boolean) as PineEdge[];

    const [x] = selected.reverse();

    const suggestedEdges = suggested
      .map(h => makeEdge(edgeLookup, metadata, x, h))
      .filter(Boolean) as PineEdge[];

    // const edgeLookup = selectedEdges.concat(suggestedEdges).reduce(
    //   (acc, edge) => {
    //     if (!edge) return acc;
    //     if (!acc[edge.id]) {
    //       acc[edge.id] = edge;
    //     }
    //     return acc;
    //   },
    //   {} as { [id: string]: PineEdge },
    // );

    this.edges = Object.values(edgeLookup);
  };
}
