import { Edge, Position } from 'reactflow';
import { PineEdge, PineNode, PineSelectedNode, PineSuggestedNode } from '../model';
import { NodeType } from '../components/Graph.box';
import { Ast, Column, ColumnHint, Table, TableHint, WhereCondition } from './client';
import dagre from 'dagre';

export type Graph = {
  // Metadata
  candidate: { pine: string } | null;

  // Reactflow nodes and edges - this is ready to be rendered
  selectedNodes: PineSelectedNode[];
  suggestedNodes: PineSuggestedNode[];
  edges: PineEdge[];
};

export const getCandidateIndex = (suggestedTables: TableHint[], ci: number) => {
  // No suggestions - reset the index
  if (!suggestedTables.length) {
    return 0;
  }
  // Make sure that the index is within bounds i.e. the candidate selection
  // should cycle up or down
  return (ci < 0 ? suggestedTables.length + ci : ci) % suggestedTables.length;
};

// Generate a palette of contrasting modern colors
const LightColors = ['#ff4e50', '#ff9f51', '#ffea51', '#4caf50', '#64b6ac'];
const DarkColors = ['#cf6679', '#d4995c', '#e6c07b', '#98c379', '#61afef'];

/**
 * Get the color for the schema. Note: this function probably has collisions.
 * TODO: Keep track of the schemas and colors to avoid collisions.
 */
export const getSchemaColor = (schema: string, isDark: boolean = false) => {
  if (!schema) schema = 'public';
  const hash = schema.split('').reduce((acc, x) => acc + x.charCodeAt(0), 0);
  const colors = isDark ? DarkColors : LightColors;
  const publicColor = isDark ? '#4b5263' : '#FFF';
  const color = schema === 'public' ? publicColor : colors[hash % colors.length];
  return { schema, color };
};

/** Palette for result column tints (index-based so each table gets a distinct color). */
const ResultColumnLight = [
  '#e3f2fd', '#fff3e0', '#f3e5f5', '#e8f5e9', '#e0f7fa',
  '#fce4ec', '#f1f8e9', '#e8eaf6', '#fff8e1', '#efebe9',
];
const ResultColumnDark = [
  '#1e3a5f', '#4a3728', '#3d2d45', '#1e4620', '#1a3d42',
  '#4a2035', '#2d3d22', '#2c2d45', '#4a4020', '#3d3835',
];

/**
 * Returns a background color by table index (order in selected-tables).
 * Use this when you have the canonical table order so each table gets a unique color.
 */
export const getColorByTableIndex = (index: number, isDark: boolean = false): string => {
  const colors = isDark ? ResultColumnDark : ResultColumnLight;
  return colors[index % colors.length];
};

const makeSelectedNode = (
  n: Table,
  order: number,
  columns: string[],
  orderColumns: string[],
  whereColumns: string[],
  suggestedColumns: string[],
  suggestedOrderColumns: string[],
  suggestedWhereColumns: string[],
  sessionId: string,
  isDark: boolean = false,
): PineSelectedNode => {
  const { schema, table, alias } = n;
  const { color } = getSchemaColor(n.schema, isDark);
  const id = alias;
  return {
    id,
    type: NodeType.Selected,
    data: {
      schema,
      table,
      column: 'unknown',
      color,
      type: 'selected',
      alias,
      order,
      columns,
      orderColumns,
      whereColumns,
      suggestedColumns,
      suggestedOrderColumns,
      suggestedWhereColumns,
      sessionId,
    },
    position: { x: 0, y: 0 },
  };
};

export const makeSuggestedNode = (
  n: TableHint,
  sessionId: string,
  candidate = false,
  isDark: boolean = false,
): PineSuggestedNode => {
  const { schema, table, column, pine, parent } = n;
  const { color } = getSchemaColor(schema, isDark);

  const id = pine;

  return {
    id,
    type: NodeType.Suggested,
    data: {
      schema,
      table,
      column,
      color,
      type: candidate ? 'candidate' : 'suggested',
      pine,
      parent,
      sessionId,
    },
    position: { x: 0, y: 0 },
  };
};

const makeColumnsLookup = (columns: Column[]): Record<string, string[]> => {
  return columns.reduce(
    (acc, x) => {
      if (!acc[x.alias]) {
        acc[x.alias] = [];
      }
      acc[x.alias].push(x.column);
      return acc;
    },
    {} as Record<string, string[]>,
  );
};

const makeColumnHintsLookup = (columns: ColumnHint[]): Record<string, string[]> => {
  return columns.reduce(
    (acc, x) => {
      if (!acc[x.alias]) {
        acc[x.alias] = [];
      }
      acc[x.alias].push(x.column);
      return acc;
    },
    {} as Record<string, string[]>,
  );
};

const makeWhereColumnsLookup = (whereConditions: WhereCondition[]): Record<string, string[]> => {
  return whereConditions.reduce(
    (acc, [alias, column, , operator, value]) => {
      if (!acc[alias]) {
        acc[alias] = [];
      }
      // For display purposes, we'll show the column with its condition
      const valueText = value && value.value ? value.value : '';
      const displayText = `${column} ${operator} ${valueText}`;
      acc[alias].push(displayText);
      return acc;
    },
    {} as Record<string, string[]>,
  );
};

const makeSelectedNodes = (ast: Ast, sessionId: string, isDark: boolean = false): PineSelectedNode[] => {
  const {
    'selected-tables': selectedTables,
    columns: selectedColumns,
    order: orderColumns,
    where: whereColumns,
    hints: { select, order, where },
    operation: { type },
  } = ast;

  const count = selectedTables.length;

  const columnsLookup = makeColumnsLookup(selectedColumns);
  const orderLookup = makeColumnsLookup(orderColumns);
  const whereLookup = makeWhereColumnsLookup(whereColumns);

  const suggestedColumnsLookup = makeColumnHintsLookup(
    type === 'select' || type === 'select-partial' ? select : [],
  );
  const suggestedOrderColsLookup = makeColumnHintsLookup(
    type === 'order' || type === 'order-partial' ? order : [],
  );
  const suggestedWhereColsLookup = makeColumnHintsLookup(
    type === 'where' || type === 'where-partial' ? where : [],
  );

  const selectedNodes: PineSelectedNode[] = selectedTables
    ? selectedTables.map((x, i) => {
        const order = i + 1;
        const selectedColumns = columnsLookup[x.alias] ?? (order === count ? ['*'] : []);
        const orderColumns = orderLookup[x.alias] ?? [];
        const whereColumns = whereLookup[x.alias] ?? [];
        const suggestedColumns = suggestedColumnsLookup[x.alias] ?? [];
        const suggestedOrderColumns = suggestedOrderColsLookup[x.alias] ?? [];
        const suggestedWhereColumns = suggestedWhereColsLookup[x.alias] ?? [];
        return makeSelectedNode(
          x,
          order,
          selectedColumns,
          orderColumns,
          whereColumns,
          suggestedColumns,
          suggestedOrderColumns,
          suggestedWhereColumns,
          sessionId,
          isDark,
        );
      })
    : [];

  return selectedNodes;
};

const makeSuggestedNodes = (ast: Ast, sessionId: string, isDark: boolean = false): PineSuggestedNode[] => {
  const {
    hints: { table: suggestedTables },
  } = ast;
  const suggestedNodes: PineSuggestedNode[] = [];
  for (const h of suggestedTables) {
    const node = makeSuggestedNode(h, sessionId, false, isDark);
    suggestedNodes.push(node);
  }
  return suggestedNodes;
};

export const generateGraph = (ast: Ast, sessionId: string, isDark: boolean = false): Graph => {
  const { 'selected-tables': selectedTables, joins, context } = ast;

  const graph: Graph = {
    candidate: null,
    selectedNodes: [],
    suggestedNodes: [],
    edges: [],
  };

  /**
   * 1. Selected Nodes
   */

  const selectedNodes = makeSelectedNodes(ast, sessionId, isDark);

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
   * 2. Suggested Nodes
   */

  const suggestedNodes = makeSuggestedNodes(ast, sessionId, isDark);

  graph.selectedNodes = selectedNodes;
  graph.suggestedNodes = suggestedNodes;

  /**
   * 3. Edges
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

export const nodeWidth = 172;
export const getNodeHeight = (node: PineNode) => {
  return node.data.type === 'selected' ? 60 : 20;
};

export const getLayoutedElements = (
  cache: Record<string, { x: number; y: number }>,
  nodes: PineNode[],
  edges: PineEdge[],
) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: 'LR',
  });

  // Count total selected nodes and find max order
  const selectedNodes = nodes.filter(
    (node): node is PineSelectedNode => node.data.type === 'selected',
  );
  const maxOrder = Math.max(...selectedNodes.map(node => node.data.order));

  // First pass to set nodes and edges
  nodes.forEach(node => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: getNodeHeight(node) });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = Position.Left;
    node.sourcePosition = Position.Right;

    // Use cache only if it's not the last node by order
    if (node.data.type === 'selected' && cache[node.data.alias] && node.data.order !== maxOrder) {
      node.position = cache[node.data.alias];
    } else if (node.data.type === 'input' && cache[node.id]) {
      node.position = cache[node.data.alias];
    } else {
      node.position = {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - getNodeHeight(node) / 2,
      };
    }

    return node;
  });

  return { nodes, edges };
};
