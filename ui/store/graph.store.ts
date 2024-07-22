import { makeAutoObservable } from 'mobx';
import {
  Metadata,
  PineEdge,
  PineNode,
  PineSelectedNode,
  PineSuggestedNode,
  SelectedNode,
} from '../model';
import { edges as dummyEdges, nodes as dummyNodes } from './dummy-graph';
import { Hints, QualifiedTable, State, Table, TableHint } from './http';
import { Edge } from 'reactflow';

type E = {
  from: PineNode;
  to: PineNode;
};

/**
 * @deprecated Node id generation is different for selected and suggested nodes
 */
const makeNodeId = ({ schema, table, alias }: QualifiedTable) => {
  return alias ?? `${schema}.${table}`;
};
const makeEdgeId = ({ from, to }: E) => {
  return `${makeNodeId(from.data)} -> ${makeNodeId(to.data)}`;
};

// Generate a pallette of constrasting modern colors
const Colors = ['#ff4e50', '#ff9f51', '#ffea51', '#4caf50', '#64b6ac'];

/**
 * @deprecated Use `makeSelectedNode` and `makeSuggestedNode` instead.
 */
const makeNode = (
  n: QualifiedTable,
  type: 'selected' | 'suggested' | 'candidate',
  order?: number | null,
): PineNode => {
  const { schema, table, alias } = n;
  const { color } = getColor(schema);

  const data =
    type === 'selected'
      ? {
          schema,
          table,
          color,
          type,
          joinOn: 'unknown',
          alias: alias!,
          order: order!,
        }
      : {
          schema,
          table,
          color,
          type,
          joinOn: 'unknown',
          pine: `${table}`,
        };
  return {
    id: makeNodeId(n),
    type: 'pineNode',
    data,
    position: { x: 0, y: 0 },
  };
};

const makeSelectedNode = (n: Table, order: number): PineNode => {
  const { schema, table, alias } = n;
  const { color } = getColor(n.schema);
  const id = alias;
  return {
    id,
    type: 'pineNode',
    data: {
      schema,
      table,
      joinOn: 'unknown',
      color,
      type: 'selected',
      alias,
      order,
    },
    position: { x: 0, y: 0 },
  };
};

const makeSuggestedNode = (n: TableHint, candidate = false): PineSuggestedNode => {
  const { schema, table, column, pine, parent } = n;
  const { color } = getColor(schema);

  // Pine doesn't support directionality at the moment.
  const id = pine;

  return {
    id,
    type: 'pineNode',
    data: {
      schema,
      table,
      joinOn: column,
      color,
      type: candidate ? 'candidate' : 'suggested',
      pine,
      parent,
    },
    position: { x: 0, y: 0 },
  };
};

/**
 * @deprecated Use updateEdgeLookup
 */
const updateEdgeLookupLegacy = (
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
  /**
   * @deprecated We should use `state.joins` instead of using `metadata`.
   */
  metadata: Metadata = { 'db/references': { table: {} } };
  /**
   * @deprecated
   */
  selectedTables: Table[] = [];
  /**
   * deprecated
   */
  suggestedTables: TableHint[] = [];
  state: State = {
    hints: {
      table: [],
    },
    'selected-tables': [],
    joins: {},
  };

  // Candidate
  candidateIndex: number | undefined = undefined;
  candidate: PineNode | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  public loadDummyNodesAndEdges = async () => {
    this.nodes = dummyNodes.map(x => ({ ...x, selectable: false }));
    this.edges = dummyEdges.map(e => ({ ...e, selectable: false, animated: false }));
  };

  public selectNextCandidate = (offset: number) => {
    if (this.candidateIndex === undefined) {
      this.candidateIndex = 0;
    } else if (offset) {
      this.candidateIndex = this.candidateIndex + offset;
    }
    this.generateGraphWrapper(this.state, this.metadata, this.selectedTables, this.suggestedTables);
  };

  public getCandidate() {
    if (this.candidateIndex === undefined) {
      return null;
    }
    // TODO: use suggestedNodes?
    return this.suggestedTables[this.candidateIndex % this.suggestedTables.length];
  }

  public resetCandidate() {
    this.candidateIndex = undefined;
    this.candidate = null;
    this.generateGraphWrapper(this.state, this.metadata, this.selectedTables, this.suggestedTables);
  }

  /**
   * 1. Calculate candidate index (this could be moved to another function)
   * 2. Make selected nodes using `selectedTables: Table[]`
   * 3. Make suggested nodes using `suggestedTables: TableHint[]`
   */
  public generateGraphWrapper = (
    state: State,
    metadata: Metadata,
    selectedTables: Table[],
    suggestedTables: TableHint[],
  ) => {
    // this.generateGraphDeprecated(metadata, selectedTables, suggestedTables);

    this.state = state;
    this.suggestedTables = suggestedTables;
    this.generateGraph();
  };

  public generateGraph = () => {
    const {
      hints: { table: suggestedTables },
      'selected-tables': selectedTables,
      joins,
    } = this.state;

    // TODO: move index calculation before the graph generation. Pass candidate index as argumnet
    this.candidateIndex = this.getCandidateIndex(suggestedTables, this.candidateIndex);

    // Create nodes for the selected and suggested tables
    const selectedNodes: PineNode[] = selectedTables
      ? selectedTables.map((x, i) => makeSelectedNode(x, i + 1))
      : [];

    const suggestedNodes: PineSuggestedNode[] = [];
    for (const { h, i } of suggestedTables.map((h, i) => ({ h, i }))) {
      const isCandidate = this.candidateIndex !== undefined && i === this.candidateIndex;
      const node = makeSuggestedNode(h, isCandidate);
      suggestedNodes.push(node);
      if (isCandidate) {
        this.candidate = node;
      }
    }
    this.nodes = selectedNodes.concat(suggestedNodes);

    // If there are no selected tables, there are no edges
    if (selectedTables.length < 1) {
      this.edges = [];
      return;
    }

    // `selectedNodes` is an array of objects e.g. [ {schema: 'public', table: 'users'}, {schema: 'public', table: 'orders'}]
    // Create pairs of items from the context e.g. [ x, y, z] => [ [x, y], [x, z], [y, z] ]
    const pairs = selectedNodes.reduce((acc: [PineNode, PineNode][], current, index, array) => {
      // Check to ensure we don't go out of bounds
      if (index < array.length - 1) {
        acc.push([current, array[index + 1]]);
      }
      return acc;
    }, []);

    if (suggestedNodes.length === 0) {
      this.edges = [];
    }

    // TODO: we don't always have to regenerate the lookup. This can be cached
    const edgeLookup: Record<string, Edge> = {};

    const makeId = ({ from: x, to: y }: { from: PineNode; to: PineNode }) => `${x.id} ${y.id}`;
    for (const [x, y] of pairs) {
      debugger;
      const r =
        joins[(x as any as PineSelectedNode).data.alias][(y as any as PineSelectedNode).data.alias];
      const e = r[2] === 'has' ? { from: x, to: y } : { from: y, to: x };
      const id = makeId(e);
      if (!edgeLookup[id]) {
        edgeLookup[id] = {
          id,
          source: e.from.id,
          target: e.to.id,
        };
      }
    }
    const [current] = selectedNodes.reverse();
    for (const y of suggestedNodes) {
      const isParent = y.data.parent;
      const e = { to: isParent ? current : y, from: isParent ? y : current };
      const id = makeId(e);
      if (!edgeLookup[id]) {
        edgeLookup[id] = {
          id,
          source: e.from.id,
          target: e.to.id,
        };
      }
    }

    this.edges = Object.values(edgeLookup);
  };

  /**
   * @deprecated
   */
  public generateGraphDeprecated = (
    metadata: Metadata,
    selectedTables: Table[],
    suggestedTables: TableHint[],
  ) => {
    this.metadata = metadata;
    this.selectedTables = selectedTables;
    this.suggestedTables = suggestedTables;

    // Create nodes for the selected and suggested tables
    const selectedNodes: PineNode[] = selectedTables
      ? selectedTables.map((x, i) => makeNode(x, 'selected', i + 1))
      : [];

    this.candidateIndex = this.getCandidateIndex(suggestedTables, this.candidateIndex);

    // Create suggested nodes
    // Keep track of the candidate node
    const suggestedNodes: PineNode[] = [];
    for (const { h, i } of suggestedTables.map((h, i) => ({ h, i }))) {
      const isCandidate = this.candidateIndex !== undefined && i === this.candidateIndex;
      const node = makeNode(h, isCandidate ? 'candidate' : 'suggested');
      suggestedNodes.push(node);
      if (isCandidate) {
        this.candidate = node;
      }
    }
    this.nodes = selectedNodes.concat(suggestedNodes);

    // If there are no selected tables, there are no edges
    if (selectedTables.length < 1) {
      this.edges = [];
      return;
    }

    // `selectedNodes` is an array of objects e.g. [ {schema: 'public', table: 'users'}, {schema: 'public', table: 'orders'}]
    // Create pairs of items from the context e.g. [ x, y, z] => [ [x, y], [x, z], [y, z] ]
    const pairs = selectedNodes.reduce((acc: [PineNode, PineNode][], current, index, array) => {
      if (index < array.length - 1) {
        // Check to ensure we don't go out of bounds
        acc.push([current, array[index + 1]]);
      }
      return acc;
    }, []);

    const edgeLookup = {};
    for (const [x, y] of pairs) {
      updateEdgeLookupLegacy(edgeLookup, metadata, x, y);
    }
    const [current] = selectedNodes.reverse();
    for (const y of suggestedNodes) {
      updateEdgeLookupLegacy(edgeLookup, metadata, current, y);
    }

    this.edges = Object.values(edgeLookup);
  };

  /**
   * Recalculate the candidate index
   * Make sure it doesn't go out of bounds
   */
  private getCandidateIndex(suggestedTables: TableHint[], ci: number | undefined) {
    if (ci === undefined) return; // No candidate selected

    // No suggestions - reset the index
    if (!suggestedTables.length) {
      return 0;
    }
    // Make sure that the index is within bounds i.e. the candidate selection
    // should cycle up or down
    return (ci < 0 ? suggestedTables.length + ci : ci) % suggestedTables.length;
  }
}

/**
 * Get the color for the schema. Note: this function probably has collisions.
 * TODO: Keep track of the schemas and colors to avoid collisions.
 */
function getColor(schema: string) {
  if (!schema) schema = 'public';
  const hash = schema.split('').reduce((acc, x) => acc + x.charCodeAt(0), 0);
  const color = schema === 'public' ? '#FFF' : Colors[hash % Colors.length];
  return { schema, color };
}
