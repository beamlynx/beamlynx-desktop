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

const makeNode = (
  n: QualifiedTable,
  type: 'selected' | 'suggested' | 'candidate',
  order?: number | null,
): PineNode => {
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
      order,
    },
    position: { x: 0, y: 0 },
  };
};

const updateEdgeLookup = (
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

  // For redrawing
  metadata: Metadata = { 'db/references': { table: {} } };
  context: QualifiedTable[] = [];
  hints: QualifiedTable[] = [];

  // Candidate
  candidateIndex: number | undefined = undefined;
  candidate: PineNode | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  loadDummyNodesAndEdges = async () => {
    this.nodes = dummyNodes.map(x => ({ ...x, selectable: false }));
    this.edges = dummyEdges.map(e => ({ ...e, selectable: false, animated: false }));
  };

  selectNextCandidate = (offset: number) => {
    if (this.candidateIndex === undefined) {
      this.candidateIndex = 0;
    } else {
      this.candidateIndex = this.candidateIndex + offset;
    }
    this.generateGraph(this.metadata, this.context, this.hints);
  };

  getCandidate() {
    if (this.candidateIndex === undefined) {
      return null;
    }
    return this.hints[this.candidateIndex % this.hints.length];
  }

  resetCandidate() {
    this.candidateIndex = undefined;
    this.candidate = null;
    this.generateGraph(this.metadata, this.context, this.hints);
  }

  generateGraph = (
    metadata: Metadata,
    context: QualifiedTable[],
    hints: QualifiedTable[],
  ) => {
    this.metadata = metadata;
    this.context = context;
    this.hints = hints;

    // Create nodes for the selected and suggested tables
    const selected: PineNode[] = context
      ? context.map((x, i) => makeNode(x, 'selected', i + 1))
      : [];

    // Update the candidate index
    // Make sure it doesn't go out of bounds
    let ci = this.candidateIndex;
    if (ci !== undefined) {
      ci = ci < 0 ? hints.length + ci : ci;
      ci = ci % hints.length;
      this.candidateIndex = ci;
    }

    // Create suggested nodes
    // Keep track of the candidate node
    const suggested: PineNode[] = []; 
    for (const { h, i } of hints.map((h, i) => ({ h, i }))) {
      const isCandidate = this.candidateIndex !== undefined && i === ci;
      const node = makeNode(h, isCandidate ? 'candidate' : 'suggested');
      suggested.push(node);
      if (isCandidate) {
        this.candidate = node;
      }
    }
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
    for (const [x, y] of pairs) {
      updateEdgeLookup(edgeLookup, metadata, x, y);
    }
    const [current] = selected.reverse();
    for (const y of suggested) {
      updateEdgeLookup(edgeLookup, metadata, current, y);
    }

    this.edges = Object.values(edgeLookup);
  };
}
