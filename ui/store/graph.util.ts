import { Edge } from 'reactflow';
import { PineEdge, PineNode, PineSelectedNode, PineSuggestedNode } from '../model';
import { NodeType } from '../components/Graph.box';
import { Ast, Table, TableHint } from './client';

export type Graph = {
  nodes: PineNode[];
  edges: PineEdge[];
};

type R = {
  candidate: TableHint | null;
  graph: Graph;
};

const getCandidateIndex = (suggestedTables: TableHint[], ci: number | undefined) => {
  if (ci === undefined) return; // No candidate selected

  // No suggestions - reset the index
  if (!suggestedTables.length) {
    return 0;
  }
  // Make sure that the index is within bounds i.e. the candidate selection
  // should cycle up or down
  return (ci < 0 ? suggestedTables.length + ci : ci) % suggestedTables.length;
};

// Generate a pallette of constrasting modern colors
const Colors = ['#ff4e50', '#ff9f51', '#ffea51', '#4caf50', '#64b6ac'];

/**
 * Get the color for the schema. Note: this function probably has collisions.
 * TODO: Keep track of the schemas and colors to avoid collisions.
 */
const getColor = (schema: string) => {
  if (!schema) schema = 'public';
  const hash = schema.split('').reduce((acc, x) => acc + x.charCodeAt(0), 0);
  const color = schema === 'public' ? '#FFF' : Colors[hash % Colors.length];
  return { schema, color };
};

const makeSelectedNode = (n: Table, order: number, columns: string[]): PineSelectedNode => {
  const { schema, table, alias } = n;
  const { color } = getColor(n.schema);
  const id = alias;
  return {
    id,
    type: NodeType.Selected,
    data: {
      schema,
      table,
      joinOn: 'unknown',
      color,
      type: 'selected',
      alias,
      order,
      columns,
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
    type: NodeType.Suggested,
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

const getSelectedNodes = (ast: Ast): PineSelectedNode[] => {
  const { 'selected-tables': selectedTables, columns } = ast;

  const columnsLookup = columns.reduce(
    (acc, x) => {
      if (!acc[x.alias]) {
        acc[x.alias] = [];
      }
      acc[x.alias].push(x.column);
      return acc;
    },
    {} as Record<string, string[]>,
  );
  const count = selectedTables.length;

  const selectedNodes: PineSelectedNode[] = selectedTables
    ? selectedTables.map((x, i) => {
        const order = i + 1;
        const columns = columnsLookup[x.alias] ?? (order === count ? ['*'] : []);
        return makeSelectedNode(x, order, columns);
      })
    : [];

  return selectedNodes;
};

export const generateGraph = (ast: Ast, candidateIndex?: number): R => {
  const {
    hints: { table: suggestedTables },
    'selected-tables': selectedTables,
    joins,
    context,
    columns,
  } = ast;

  // TODO: move index calculation before the graph generation. Pass candidate
  // index as argument
  const r: R = {
    candidate: null,
    graph: {
      edges: [],
      nodes: [],
    },
  };

  const sanitizedCandidateIndex = getCandidateIndex(suggestedTables, candidateIndex);

  // Create nodes for the selected and suggested tables
  const selectedNodes = getSelectedNodes(ast);

  // TODO: there can be a better way
  const contextNode: PineNode = selectedNodes.find(n => n.id === context)!;

  const suggestedNodes: PineSuggestedNode[] = [];
  for (const { h, i } of suggestedTables.map((h, i) => ({ h, i }))) {
    const isCandidate = sanitizedCandidateIndex !== undefined && i === sanitizedCandidateIndex;
    const node = makeSuggestedNode(h, isCandidate);
    suggestedNodes.push(node);
    if (isCandidate) {
      r.candidate = h;
    }
  }
  const nodes = selectedNodes.concat(suggestedNodes);
  const selectedNodesLookup = selectedNodes.reduce(
    (acc, x) => {
      acc[x.id] = x;
      return acc;
    },
    {} as Record<string, PineNode>,
  );

  r.graph.nodes = nodes;

  // If there are no selected tables, there are no edges
  if (selectedTables.length < 1) {
    r.graph.edges = [];
    return r;
  }

  if (suggestedNodes.length === 0) {
    r.graph.edges = [];
  }

  // TODO: we don't always have to regenerate the lookup. This can be cached
  const edgeLookup: Record<string, Edge> = {};

  const makeId = ({ from: x, to: y }: { from: PineNode; to: PineNode }) => `${x.id} ${y.id}`;

  for (const [fromAlias, toAlias, relation] of joins) {
    const x = selectedNodesLookup[fromAlias];
    const y = selectedNodesLookup[toAlias];
    if (!x || !y || !relation) {
      continue;
    }
    const e = relation[2] === 'has' ? { from: x, to: y } : { from: y, to: x };
    const id = makeId(e);
    if (!edgeLookup[id]) {
      edgeLookup[id] = {
        id,
        source: e.from.id,
        target: e.to.id,
      };
    }
  }

  for (const y of suggestedNodes) {
    const isParent = y.data.parent;
    const e = { to: isParent ? contextNode : y, from: isParent ? y : contextNode };
    const id = makeId(e);
    if (!edgeLookup[id]) {
      edgeLookup[id] = {
        id,
        source: e.from.id,
        target: e.to.id,
      };
    }
  }

  r.graph.edges = Object.values(edgeLookup);

  return r;
};
