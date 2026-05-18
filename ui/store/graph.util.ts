import { Edge, Position } from 'reactflow';
import { PineEdge, PineNode, PineSelectedNode, PineSuggestedNode, PineVariableNode, VariableInnerTable } from '../model';
import { NodeType } from '../components/Graph.box';
import { Ast, Column, ColumnHint, Table, TableHint, VariableAst, WhereCondition } from './client';
import dagre from 'dagre';

export type Graph = {
  // Metadata
  candidate: { pine: string } | null;

  // Reactflow nodes and edges - this is ready to be rendered
  selectedNodes: PineNode[];
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
  const { schema, table, column, pine, parent, heuristic } = n;
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
      heuristic,
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

const makeVariableNodes = (
  outerSelectedTables: Table[],
  variables: Record<string, VariableAst>,
  sessionId: string,
  isDark: boolean,
): {
  containerNodes: PineVariableNode[];
  containersByOuterAlias: Record<string, PineVariableNode>;
} => {
  const containerNodes: PineVariableNode[] = [];
  const containersByOuterAlias: Record<string, PineVariableNode> = {};

  for (const outerTable of outerSelectedTables) {
    const varAst = variables[outerTable.table];
    if (!varAst) continue;

    const variableName = outerTable.table;
    // Use :tables (raw accumulation) not :selected-tables, which strips the last
    // table when operation type is :table (intended for live graph, wrong for variables).
    const innerTables: VariableInnerTable[] = (varAst['tables'] ?? varAst['selected-tables'] ?? []).map(t => ({
      table: t.table,
      schema: t.schema,
      alias: t.alias,
      color: getSchemaColor(t.schema, isDark).color,
    }));

    const containerId = `var:${variableName}`;

    const containerNode: PineVariableNode = {
      id: containerId,
      type: NodeType.Variable,
      data: {
        type: 'variable',
        variableName,
        sessionId,
        innerTables,
      },
      position: { x: 0, y: 0 },
    };

    containerNodes.push(containerNode);
    containersByOuterAlias[outerTable.alias] = containerNode;
  }

  return { containerNodes, containersByOuterAlias };
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
  const variables = ast.variables ?? {};
  const pendingAssignments = ast['pending-assignments'] ?? {};

  const graph: Graph = {
    candidate: null,
    selectedNodes: [],
    suggestedNodes: [],
    edges: [],
  };

  /**
   * 1. Variable container nodes (cross-expression, edges connect them to neighbors)
   */
  const { containerNodes: varContainerNodes, containersByOuterAlias: varContainersByAlias } =
    makeVariableNodes(selectedTables ?? [], variables, sessionId, isDark);
  const variableOuterAliases = new Set(Object.keys(varContainersByAlias));

  /**
   * 2. Checkpoint container nodes (current expression, same visual as variables but no edges).
   *    Reuses makeVariableNodes since pending-assignments has the same shape as variables.
   */
  const { containerNodes: cpContainerNodes, containersByOuterAlias: cpContainersByAlias } =
    makeVariableNodes(selectedTables ?? [], pendingAssignments, sessionId, isDark);
  const checkpointOuterAliases = new Set(Object.keys(cpContainersByAlias));

  /**
   * 3. Normal selected nodes — exclude variable and checkpoint CTE tables
   */
  const allSelectedNodes = makeSelectedNodes(ast, sessionId, isDark);
  const normalSelectedNodes = allSelectedNodes.filter(
    n => !variableOuterAliases.has(n.id) && !checkpointOuterAliases.has(n.id),
  );

  /**
   * 4. Node lookup for edges.
   *    Variable containers are included so edges connect them to their neighbors.
   *    Checkpoint containers are excluded — they are intentionally disconnected.
   */
  const selectedNodesLookup: Record<string, PineNode> = {};
  for (const n of normalSelectedNodes) selectedNodesLookup[n.id] = n;
  for (const [outerAlias, containerNode] of Object.entries(varContainersByAlias)) {
    selectedNodesLookup[outerAlias] = containerNode;
  }
  const contextNode: PineNode = selectedNodesLookup[context];

  /**
   * 5. Suggested nodes
   */
  const suggestedNodes = makeSuggestedNodes(ast, sessionId, isDark);

  graph.selectedNodes = [...normalSelectedNodes, ...varContainerNodes, ...cpContainerNodes];
  graph.suggestedNodes = suggestedNodes;

  /**
   * 6. Edges — checkpoint aliases are absent from selectedNodesLookup,
   *    so their joins are silently skipped by the !x || !y guard below.
   */
  if (!selectedTables || selectedTables.length < 1) {
    graph.edges = [];
    return graph;
  }

  const edgeLookup: Record<string, Edge> = {};
  const makeId = ({ from: x, to: y }: { from: PineNode; to: PineNode }) => `${x.id} ${y.id}`;

  for (const [fromAlias, toAlias, relation] of joins) {
    const x = selectedNodesLookup[fromAlias];
    const y = selectedNodesLookup[toAlias];
    if (!x || !y || !relation) continue;
    const e = relation[2] === 'has' ? { from: x, to: y } : { from: y, to: x };
    const id = makeId(e);
    if (!edgeLookup[id]) {
      edgeLookup[id] = { id, source: e.from.id, target: e.to.id };
    }
  }

  for (const y of suggestedNodes) {
    if (!contextNode) continue;
    const isParent = y.data.parent;
    const e = { to: isParent ? contextNode : y, from: isParent ? y : contextNode };
    const id = makeId(e);
    if (!edgeLookup[id]) {
      edgeLookup[id] = { id, source: e.from.id, target: e.to.id };
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
  dagreGraph.setGraph({ rankdir: 'LR' });

  const selectedNodes = nodes.filter(
    (node): node is PineSelectedNode => node.data.type === 'selected',
  );
  const maxOrder = selectedNodes.length > 0 ? Math.max(...selectedNodes.map(n => n.data.order)) : 0;

  nodes.forEach(node => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: getNodeHeight(node) });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (!nodeWithPosition) return;

    node.targetPosition = Position.Left;
    node.sourcePosition = Position.Right;

    const h = getNodeHeight(node);

    if (node.data.type === 'variable') {
      const cacheKey = `var:${node.data.variableName}`;
      node.position = cache[cacheKey] ?? {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - h / 2,
      };
    } else if (node.data.type === 'selected' && cache[node.data.alias] && node.data.order !== maxOrder) {
      node.position = cache[node.data.alias];
    } else if (node.data.type === 'input' && cache[node.id]) {
      node.position = cache[node.data.alias];
    } else {
      node.position = {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - h / 2,
      };
    }
  });

  return { nodes, edges };
};
