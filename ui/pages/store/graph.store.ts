import { makeAutoObservable } from 'mobx';
import { Metadata, PineEdge, PineNode } from '../components/model';
import { edges as dummyEdges, nodes as dummyNodes } from './dummy-graph';
import { Context, Hints } from './http';

type N = {
  schema: string;
  table: string;
};

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

const makeNode = (n: N) => {
  const { table } = n;
  return {
    id: makeNodeId(n),
    data: { label: table },
    position: { x: 0, y: 0 },
  };
};
const addDummySchema = (table: string) => ({ schema: 'unknown', table });

const makeEdge = (metadata: Metadata, from: string, to: string, animated = false): PineEdge | undefined => {
  let x, y;
  const tables = metadata['db/references'].table;
  if (tables[from] && tables[from]['refers-to'] && tables[from]['refers-to'][to]) {
    x = from;
    y = to;
  } else if (tables[to] && tables[to]['refers-to'] && tables[to]['refers-to'][from]) {
    x = to;
    y = from;
  } else {
    return;
  }
  const e = { from: addDummySchema(y), to: addDummySchema(x) };
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
    const { table: tableHints } = hints;
    const selected = context ? context.map(addDummySchema).map(makeNode) : [];
    const suggested = tableHints.map(addDummySchema).map(makeNode);
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

  // getDatabaseGraph = async () => {
  //   const response = await Http.get('connection/graph');
  //   if (!response) return;
  //   this.graph = response.result as Graph;
  //   const from = { schema: 'public', table: 'user' };
  //   const to = { schema: 'public', table: 'tenant' };
  //   this.graph.nodes = [from, to].map(makeNode);
  //   this.graph.edges = [{ from, to }].map(makeEdge);
  //   return this.graph;
  // };
}
