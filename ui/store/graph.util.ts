import { Edge } from 'reactflow';
import { PineEdge, PineNode, PineSelectedNode, PineSuggestedNode } from '../model';
import { NodeType } from '../components/Graph.box';
import { Ast, Table, TableHint } from './client';

export type Graph = {
  // Metadata
  candidate: TableHint | null;

  // Reactflow nodes and edges - this is ready to be rendered
  selectedNodes: PineSelectedNode[];
  suggestedNodes: PineSuggestedNode[];
  edges: PineEdge[];
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

const makeSelectedNode = (
  n: Table,
  order: number,
  columns: string[],
  suggestedColumns: string[],
): PineSelectedNode => {
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
      suggestedColumns,
    },
    position: { x: 0, y: 0 },
  };
};

const makeSuggestedNode = (n: TableHint, candidate = false): PineSuggestedNode => {
  const { schema, table, column, pine, parent } = n;
  const { color } = getColor(schema);

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

const makeSelectedNodes = (ast: Ast): PineSelectedNode[] => {
  const {
    'selected-tables': selectedTables,
    columns,
    current,
    hints: { select: suggestedColumns },
  } = ast;

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

  // index suggested columns by alias
  const suggestedColumnsLookup = suggestedColumns.reduce(
    (acc, x) => {
      if (!acc[x.alias]) {
        acc[x.alias] = [];
      }
      acc[x.alias].push(x.column);
      return acc;
    },
    {} as Record<string, string[]>,
  );

  const selectedNodes: PineSelectedNode[] = selectedTables
    ? selectedTables.map((x, i) => {
        const order = i + 1;
        const columns = columnsLookup[x.alias] ?? (order === count ? ['*'] : []);
        return makeSelectedNode(x, order, columns, suggestedColumnsLookup[x.alias] ?? []);
      })
    : [];

  return selectedNodes;
};

const makeSuggestedNodes = (ast: Ast, candidate: TableHint | null): PineSuggestedNode[] => {
  const {
    hints: { table: suggestedTables },
  } = ast;
  const suggestedNodes: PineSuggestedNode[] = [];
  for (const h of suggestedTables) {
    const node = makeSuggestedNode(h, h === candidate);
    suggestedNodes.push(node);
  }
  return suggestedNodes;
};

export const generateGraph = (ast: Ast, candidateIndex?: number): Graph => {
  const {
    hints: { table: suggestedTables },
    'selected-tables': selectedTables,
    joins,
    context,
  } = ast;

  const graph: Graph = {
    candidate: null,
    selectedNodes: [],
    suggestedNodes: [],
    edges: [],
  };

  /**
   * 1. Selected Nodes
   */

  const selectedNodes = makeSelectedNodes(ast);

  // Find the context node
  const selectedNodesLookup = selectedNodes.reduce(
    (acc, x) => {
      acc[x.id] = x;
      return acc;
    },
    {} as Record<string, PineNode>,
  );
  const contextNode: PineNode = selectedNodesLookup[context];

  /**
   * 2. Candidate
   */

  const sanitizedCandidateIndex = getCandidateIndex(suggestedTables, candidateIndex);
  if (sanitizedCandidateIndex !== undefined) {
    for (const { h, i } of suggestedTables.map((h, i) => ({ h, i }))) {
      if (i === sanitizedCandidateIndex) {
        graph.candidate = h;
      }
    }
  }

  /**
   * 3. Suggested Nodes
   */

  const suggestedNodes = makeSuggestedNodes(ast, graph.candidate);

  graph.selectedNodes = selectedNodes;
  graph.suggestedNodes = suggestedNodes;

  /**
   * 4. Edges
   */

  // If there are no selected tables, there are no edges
  if (selectedTables.length < 1) {
    graph.edges = [];
    return graph;
  }

  if (suggestedNodes.length === 0) {
    graph.edges = [];
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

  graph.edges = Object.values(edgeLookup);

  return graph;
};
