import { Edge, Position } from 'reactflow';
import {
  NodeHandle,
  PineEdge,
  PineNode,
  PineSelectedNode,
  PineSuggestedNode,
  PineVariableNode,
  VariableInnerTable,
} from '../model';
import { NodeType } from '../components/Graph.box';
import { Ast, Column, ColumnHint, Table, TableHint, VariableAst, WhereCondition } from './client';
import {
  effectiveHandleCount,
  getSelectedNodeHeight,
  getSuggestedNodeHeight,
  getVariableNodeHeight,
  nodeWidth,
} from './node-layout';
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

// A heuristic or synthetic resolution isn't a real FK constraint - a guessed
// naming-convention match or a made-up id=id join respectively (see
// pine-lang's docs/joins.md) - so the suggestion edge is dashed to flag that
// it's not a guaranteed relationship, unlike a plain solid "fk" edge. This
// stays a plain, module-level object (not something built inside
// generateGraph/session.graph, which is a deep MobX observable) - handing
// ReactFlow a style object that MobX has turned into an observable Proxy
// crashes its DOM style diffing, so styling is applied in Graph.box.tsx's
// local (non-observable) edge list instead - see isUncertainResolution.
export const uncertainEdgeStyle = { strokeDasharray: '4 4' };
export const isUncertainResolution = (resolution: TableHint['resolution']) =>
  resolution === 'heuristic' || resolution === 'synthetic';

/**
 * Get the color for the schema. Note: this function probably has collisions.
 * TODO: Keep track of the schemas and colors to avoid collisions.
 */
export const getSchemaColor = (schema: string | null, isDark: boolean = false) => {
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
      leftHandles: [],
      rightHandles: [],
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
  const { schema, table, column, pine, parent, resolution } = n;
  const relatedColumn = n['related-column'];
  const { color } = getSchemaColor(schema, isDark);

  const id = pine;

  return {
    id,
    type: NodeType.Suggested,
    data: {
      schema,
      table,
      column,
      relatedColumn,
      color,
      type: candidate ? 'candidate' : 'suggested',
      pine,
      parent,
      resolution,
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

  for (let i = 0; i < outerSelectedTables.length; i++) {
    const outerTable = outerSelectedTables[i];
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
        order: i + 1,
        leftHandles: [],
        rightHandles: [],
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
   * 2. Checkpoint container nodes (current expression).
   *    pending-assignments holds every `|= name`, whether or not it actually sealed
   *    anything — a bare `|= name` with no preceding group:/limit: never resets the
   *    pipeline, so its wrapped table(s) stay in selected-tables and render normally.
   *    Only build a container for entries that truly replaced a table in
   *    selected-tables (found via outerTable below); anything else has nothing to
   *    represent in this expression's graph — it only matters to later expressions.
   *    Inner tables that are themselves checkpoint CTEs are excluded (they get their
   *    own container).
   */
  const checkpointOuterAliases = new Set<string>();
  const checkpointContainersByOuterAlias: Record<string, PineVariableNode> = {};
  const cpContainerNodes: PineVariableNode[] = [];

  for (const [cteName, varAst] of Object.entries(pendingAssignments)) {
    const outerTableIndex = (selectedTables ?? []).findIndex(t => t.table === cteName);
    if (outerTableIndex === -1) continue;
    const outerTable = selectedTables![outerTableIndex];

    const innerTables: VariableInnerTable[] = (varAst['tables'] ?? varAst['selected-tables'] ?? [])
      .filter(t => !pendingAssignments[t.table])
      .map(t => ({
        table: t.table,
        schema: t.schema,
        alias: t.alias,
        color: getSchemaColor(t.schema, isDark).color,
      }));

    const containerNode: PineVariableNode = {
      id: `var:${cteName}`,
      type: NodeType.Variable,
      data: {
        type: 'variable',
        variableName: cteName,
        sessionId,
        innerTables,
        order: outerTableIndex + 1,
        leftHandles: [],
        rightHandles: [],
      },
      position: { x: 0, y: 0 },
    };

    checkpointOuterAliases.add(outerTable.alias);
    checkpointContainersByOuterAlias[outerTable.alias] = containerNode;
    cpContainerNodes.push(containerNode);
  }

  /**
   * 3. Normal selected nodes — exclude variable and checkpoint CTE tables
   */
  const allSelectedNodes = makeSelectedNodes(ast, sessionId, isDark);
  const normalSelectedNodes = allSelectedNodes.filter(
    n => !variableOuterAliases.has(n.id) && !checkpointOuterAliases.has(n.id),
  );

  /**
   * 4. Node lookup for edges. Variable and checkpoint containers are both included
   *    so joins/suggested-node edges connect to them like any other table — a
   *    sealed checkpoint replaces a real table in the pipeline, so it needs to be
   *    joinable the same way.
   */
  const selectedNodesLookup: Record<string, PineNode> = {};
  for (const n of normalSelectedNodes) selectedNodesLookup[n.id] = n;
  for (const [outerAlias, containerNode] of Object.entries(varContainersByAlias)) {
    selectedNodesLookup[outerAlias] = containerNode;
  }
  for (const [outerAlias, containerNode] of Object.entries(checkpointContainersByOuterAlias)) {
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
   * 6. Edges — resolved through selectedNodesLookup, which now includes both
   *    variable and checkpoint containers, so joins/suggested edges connect to
   *    them the same as any real table.
   */
  if (!selectedTables || selectedTables.length < 1) {
    graph.edges = [];
    return graph;
  }

  const edgeLookup: Record<string, Edge> = {};
  const makeId = ({ from: x, to: y }: { from: PineNode; to: PineNode }) => `${x.id} ${y.id}`;
  // Selected nodes and variable/checkpoint containers (a sealed checkpoint
  // replaces a real table in the pipeline, so it's joinable the same way —
  // see the container-lookup comment above) get one handle per distinct
  // relation column instead of a single anonymous handle per side, so
  // multiple FK relations (to the same or different tables) render as
  // separate connection points. Suggested nodes are untouched and keep their
  // existing single anonymous handle. Each handle also records the id of the
  // node it connects to, so getLayoutedElements can later order handles to
  // match that node's actual rendered position (minimizing edge crossings)
  // once layout is known.
  const canHaveHandles = (n: PineNode): n is PineSelectedNode | PineVariableNode =>
    n.data.type === 'selected' || n.data.type === 'variable';
  type HandleEntry = { id: string; connectedNodeId: string };
  const leftHandlesByNode: Record<string, Map<string, HandleEntry>> = {};
  const rightHandlesByNode: Record<string, Map<string, HandleEntry>> = {};
  const addHandle = (
    lookup: Record<string, Map<string, HandleEntry>>,
    nodeId: string,
    column: string,
    prefix: 'l' | 'r',
    connectedNodeId: string,
  ): string => {
    if (!lookup[nodeId]) lookup[nodeId] = new Map();
    const id = `${prefix}:${column}`;
    lookup[nodeId].set(column, { id, connectedNodeId });
    return id;
  };

  for (const [fromAlias, toAlias, relation] of joins) {
    if (!relation) continue;
    const x = selectedNodesLookup[fromAlias];
    const y = selectedNodesLookup[toAlias];
    const parentIsFrom = relation[2] === 'has';
    // The "to" side of a still-typed-but-not-yet-finalized last table (see the
    // selected-tables/hints comment elsewhere in this file) has no selected
    // node yet - it only exists as a suggested candidate. The relation's real
    // column names are still known though, so give the side that DOES have a
    // node its handle now rather than losing that info to the suggested-hint
    // fallback's anonymous placeholder; the edge itself still needs both real
    // endpoints; the alias covers the handle's connectedNodeId until then.
    const from = parentIsFrom ? x : y;
    const to = parentIsFrom ? y : x;
    const fromAliasOf = parentIsFrom ? fromAlias : toAlias;
    const toAliasOf = parentIsFrom ? toAlias : fromAlias;
    // parentCol is always the column `from` (the parent) owns, childCol is
    // always the column `to` (the child) owns.
    const [, col1, , , col2] = relation;
    // Null only on a hint-less relation (see JoinRelation's comment in
    // client.ts) - this legacy graph has no confidence styling for committed
    // joins to begin with, so that case renders the same plain edge as
    // before this type was widened to admit it.
    const [parentCol, childCol] = parentIsFrom ? [col1!, col2!] : [col2!, col1!];
    const sourceHandle =
      from && canHaveHandles(from)
        ? addHandle(rightHandlesByNode, from.id, parentCol, 'r', to?.id ?? toAliasOf)
        : undefined;
    const targetHandle =
      to && canHaveHandles(to)
        ? addHandle(leftHandlesByNode, to.id, childCol, 'l', from?.id ?? fromAliasOf)
        : undefined;
    if (from && to) {
      // Keyed by column too (not just the node pair) so two distinct FK
      // relations between the same pair of nodes each get their own edge.
      const id = `${makeId({ from, to })} ${parentCol}=${childCol}`;
      if (!edgeLookup[id]) {
        edgeLookup[id] = { id, source: from.id, target: to.id, sourceHandle, targetHandle };
      }
    }
  }

  for (const y of suggestedNodes) {
    if (!contextNode) continue;
    // `parent` is entirely absent (not false) on a no-context hint - the very
    // first table typed, with no relation to anything yet (see TableHint in
    // client.ts). SuggestedNodeComponent renders no Handle at all for that
    // case (only `=== false`/`=== true` get one), so drawing an edge to/from
    // it here would target a handle that doesn't exist in the DOM - the
    // "Couldn't create edge for target handle id: undefined" React Flow
    // error. Skip the edge entirely; there's no relation to depict.
    if (y.data.parent === undefined) continue;
    const isParent = y.data.parent;
    const e = { to: isParent ? contextNode : y, from: isParent ? y : contextNode };
    const id = makeId(e);
    if (!edgeLookup[id]) {
      let sourceHandle: string | undefined;
      let targetHandle: string | undefined;
      if (canHaveHandles(contextNode)) {
        // The hint now carries both sides of the relation - y.data.column is
        // always the suggested table's own column, y.data.relatedColumn is
        // always context's own column (see TableHint in client.ts) -
        // regardless of which side is the parent. addHandle keys its lookup
        // by column name, so multiple suggestions that share the same real
        // context column (e.g. several child tables all referencing
        // company.id) naturally collapse onto the same handle.
        if (isParent) {
          targetHandle = addHandle(leftHandlesByNode, contextNode.id, y.data.relatedColumn ?? '•', 'l', y.id);
        } else {
          sourceHandle = addHandle(rightHandlesByNode, contextNode.id, y.data.relatedColumn ?? '•', 'r', y.id);
        }
      }
      edgeLookup[id] = { id, source: e.from.id, target: e.to.id, sourceHandle, targetHandle };
    }
  }

  // Initial order is by column name — a deterministic placeholder that
  // getLayoutedElements replaces once real node positions are known.
  const toHandles = (m: Map<string, HandleEntry> | undefined): NodeHandle[] =>
    m
      ? Array.from(m.entries())
          .map(([column, { id, connectedNodeId }]) => ({ id, column, connectedNodeId }))
          .sort((a, b) => a.column.localeCompare(b.column))
      : [];

  for (const n of graph.selectedNodes) {
    if (!canHaveHandles(n)) continue;
    n.data.leftHandles = toHandles(leftHandlesByNode[n.id]);
    n.data.rightHandles = toHandles(rightHandlesByNode[n.id]);
  }

  graph.edges = Object.values(edgeLookup);
  return graph;
};

export { nodeWidth };

export const getNodeHeight = (node: PineNode) => {
  if (node.data.type === 'selected') {
    return getSelectedNodeHeight(
      effectiveHandleCount(node.data.leftHandles),
      effectiveHandleCount(node.data.rightHandles),
    );
  }
  if (node.data.type === 'variable') {
    return getVariableNodeHeight(
      effectiveHandleCount(node.data.leftHandles),
      effectiveHandleCount(node.data.rightHandles),
    );
  }
  if (node.data.type === 'suggested') {
    return getSuggestedNodeHeight(!!node.data.column);
  }
  return 20;
};

// Pure with respect to `nodes`: the input nodes are the actual node objects
// living inside session.graph, a deep MobX observable (makeAutoObservable in
// session.ts). Writing layout results (position/handles/etc.) onto them
// directly would mutate observable state outside an action - the same class
// of problem as the style-object bug fixed in Graph.box.tsx (see comment
// there) - so every layout result is returned as a new node/data object
// instead of an in-place assignment.
export const getLayoutedElements = (
  cache: Record<string, { x: number; y: number }>,
  nodes: PineNode[],
  edges: PineEdge[],
) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  // nodesep is the gap between nodes stacked in the same rank (i.e.
  // vertically, given rankdir: LR) - dagre's default (50) reads as
  // needlessly airy now that suggested nodes have a real measured height
  // instead of a flat, too-small guess (see getSuggestedNodeHeight).
  dagreGraph.setGraph({ rankdir: 'LR', nodesep: 20 });

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

  const dagreYById: Record<string, number> = {};

  const positionedNodes: PineNode[] = nodes.map(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (!nodeWithPosition) return node;

    dagreYById[node.id] = nodeWithPosition.y;

    const h = getNodeHeight(node);

    let position: { x: number; y: number };
    if (node.data.type === 'variable') {
      const cacheKey = `var:${node.data.variableName}`;
      position = cache[cacheKey] ?? {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - h / 2,
      };
    } else if (node.data.type === 'selected' && cache[node.data.alias] && node.data.order !== maxOrder) {
      position = cache[node.data.alias];
    } else if (node.data.type === 'input' && cache[node.id]) {
      position = cache[node.data.alias];
    } else {
      position = {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - h / 2,
      };
    }

    return { ...node, position, targetPosition: Position.Left, sourcePosition: Position.Right };
  });

  // Order each selected/variable node's handles to match the vertical order
  // of the nodes they connect to (rather than alphabetically by column), so
  // edges fan out top-to-bottom in the same order as their targets and cross
  // each other as little as possible.
  const byConnectedNodeY = (h: NodeHandle) => dagreYById[h.connectedNodeId] ?? 0;
  const sortHandles = (handles: NodeHandle[]) =>
    [...handles].sort((a, b) => byConnectedNodeY(a) - byConnectedNodeY(b));
  const finalNodes: PineNode[] = positionedNodes.map((node): PineNode => {
    if (node.data.type === 'selected') {
      return {
        ...node,
        data: {
          ...node.data,
          leftHandles: sortHandles(node.data.leftHandles),
          rightHandles: sortHandles(node.data.rightHandles),
        },
      };
    }
    if (node.data.type === 'variable') {
      return {
        ...node,
        data: {
          ...node.data,
          leftHandles: sortHandles(node.data.leftHandles),
          rightHandles: sortHandles(node.data.rightHandles),
        },
      };
    }
    return node;
  });

  return { nodes: finalNodes, edges };
};
