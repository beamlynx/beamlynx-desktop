import dagre from 'dagre';
import { Position } from 'reactflow';
import { Ast, GroupColumn, OrderColumn } from '../client';
import {
  CanvasEdge,
  CanvasGraph,
  CanvasHandle,
  CanvasNode,
  CanvasTableNode,
  CanvasTableNodeData,
} from './canvas.model';
import { inProgressTable } from './pine-text';

// Deliberately not importing store/graph.util.ts or store/node-layout.ts -
// this is a smaller, independent version covering only what canvas mode
// needs (no suggested/candidate nodes, no variable/checkpoint containers).
// Node height, like the pre-existing graph, is sized from handle rows only
// - the select/where/order chip rows below the box grow the DOM element
// without a matching dagre height, same trade-off the existing graph
// accepts (see store/graph.util.ts's getNodeHeight).

export const nodeWidth = 190;
const handleRowHeight = 14;
const headerHeight = 48;
const minNodeHeight = 64;
const startNodeHeight = 64;
// TableNode.tsx renders the action bar (one row, ~19.5px tall + 4px margin
// at nodeWidth) ABOVE the identity box that the rest of this height models -
// dagre only knows about the box passed to it, so without this offset,
// stacked sibling nodes (same rank, different dagre y) end up spaced by
// less than what's actually on screen and their action bars visually
// overlap the node above. A fixed estimate, not a measurement - same
// trade-off as the chip rows below the box (see the file-level comment).
const actionBarHeight = 28;

const effectiveHandleCount = (handles: CanvasHandle[]): number =>
  handles.length > 1 || (handles.length === 1 && handles[0].column !== '') ? handles.length : 0;

/** The identity box's own height - what TableNode.tsx sets as its minHeight. */
export const getNodeHeight = (node: CanvasNode): number => {
  if (node.type === 'start-node') return startNodeHeight;
  const data = node.data as CanvasTableNodeData;
  const rows = Math.max(effectiveHandleCount(data.leftHandles), effectiveHandleCount(data.rightHandles));
  return rows === 0 ? minNodeHeight : headerHeight + rows * handleRowHeight + 10;
};

/** Total on-screen footprint (action bar + box) - what dagre needs for spacing, see actionBarHeight above. */
const getNodeFootprintHeight = (node: CanvasNode): number =>
  node.type === 'start-node' ? getNodeHeight(node) : getNodeHeight(node) + actionBarHeight;

const byAlias = <T,>(items: T[], aliasOf: (item: T) => string): Record<string, T[]> => {
  const acc: Record<string, T[]> = {};
  for (const item of items) {
    const alias = aliasOf(item);
    (acc[alias] ??= []).push(item);
  }
  return acc;
};

const addHandle = (
  lookup: Record<string, Map<string, CanvasHandle>>,
  nodeId: string,
  column: string,
  prefix: 'l' | 'r',
  connectedNodeId: string,
): void => {
  if (!lookup[nodeId]) lookup[nodeId] = new Map();
  lookup[nodeId].set(column, { id: `${prefix}:${column}`, column, connectedNodeId });
};

const toHandles = (m: Map<string, CanvasHandle> | undefined): CanvasHandle[] =>
  m ? Array.from(m.values()).sort((a, b) => a.column.localeCompare(b.column)) : [];

/**
 * ast -> nodes/edges (no positions yet), mirroring generateGraph's join
 * direction logic (store/graph.util.ts) but scoped to just selected-tables -
 * canvas mode has no suggested-node concept, those are replaced by pickers.
 */
// The table currently being typed is deliberately excluded from
// `ast['selected-tables']` while `operation.type === 'table'` (see
// pipeline.md - "the last table is excluded ... intended for the live
// graph"). Its identity comes from the shared `inProgressTable` helper in
// pine-text.ts, which uses `ast.current` (always the real alias, whether
// auto-generated or explicit) rather than `operation.value.alias` (only
// present once the user has actually typed `as ...`) - using the latter
// here would display a placeholder alias that no gesture (join/select/
// where/order) could actually resolve against.
// Table.schema (client.ts) is typed non-null - accurate for a fully
// resolved, already-selected table, but the in-progress table below is
// synthesized from operation.value, which can genuinely be null. Widening
// Table.schema itself ripples into model.d.ts's VariableInnerTable (out of
// bounds - see the plan doc's untouched-files list), so this stays a local,
// canvas-only shape instead.
type CanvasTableRef = { schema: string | null; table: string; alias: string };

const deriveGraph = (ast: Ast): { nodes: CanvasNode[]; edges: CanvasEdge[] } => {
  const selectedTables: CanvasTableRef[] = ast['selected-tables'] ?? [];
  const inProgress = inProgressTable(ast);
  const allTables: CanvasTableRef[] =
    inProgress && !selectedTables.some(t => t.alias === inProgress.alias)
      ? [...selectedTables, inProgress]
      : selectedTables;
  const selectByAlias = byAlias((ast.columns ?? []).filter(c => !c.hidden), c => c.alias);
  const whereByAlias = byAlias(ast.where ?? [], w => w[0]);
  // See the `order: Column[]` comment in client.ts - the real wire shape is OrderColumn.
  const orderByAlias = byAlias((ast.order ?? []) as unknown as OrderColumn[], o => o.alias);
  const groupByAlias = byAlias((ast.group ?? []) as GroupColumn[], g => g.alias);
  // pine-lang merges every group: column into ast.columns too - required so
  // the generated SQL's SELECT list actually includes what it groups by, not
  // a canvas-specific quirk. Left unfiltered, a grouped column would render
  // under BOTH the "sel" and "group" chip rows - the same column appearing
  // twice reads as "did I select this too, or is this a display bug?" when
  // the user only ever did the one gesture (group). Whether or not the user
  // also separately wrote select: for it is unrecoverable from ast.columns
  // alone (pine-lang adds it regardless) - "sel" just excludes anything
  // already shown under "group" for that same alias, full stop.
  const groupedColumnNamesByAlias: Record<string, Set<string>> = {};
  for (const [alias, cols] of Object.entries(groupByAlias)) {
    groupedColumnNamesByAlias[alias] = new Set(cols.map(g => g.column));
  }

  const leftHandlesByAlias: Record<string, Map<string, CanvasHandle>> = {};
  const rightHandlesByAlias: Record<string, Map<string, CanvasHandle>> = {};
  const edges: CanvasEdge[] = [];

  for (const [fromAlias, toAlias, relation] of ast.joins ?? []) {
    if (!relation) {
      // Unresolved join (see pipeline.md) - still shown, flagged, rather than silently dropped.
      edges.push({ id: `${fromAlias}-${toAlias}`, source: fromAlias, target: toAlias, unresolved: true });
      continue;
    }
    const parentIsFrom = relation[2] === 'has';
    const fromNode = parentIsFrom ? fromAlias : toAlias;
    const toNode = parentIsFrom ? toAlias : fromAlias;
    const [, col1, , , col2, resolution] = relation;
    const [parentCol, childCol] = parentIsFrom ? [col1, col2] : [col2, col1];
    addHandle(rightHandlesByAlias, fromNode, parentCol, 'r', toNode);
    addHandle(leftHandlesByAlias, toNode, childCol, 'l', fromNode);
    const uncertain = resolution === 'heuristic' || resolution === 'synthetic';
    edges.push({
      id: `${fromNode}->${toNode}:${parentCol}=${childCol}`,
      source: fromNode,
      target: toNode,
      sourceHandle: `r:${parentCol}`,
      targetHandle: `l:${childCol}`,
      ...(uncertain ? { uncertain: true } : {}),
    });
  }

  const nodes: CanvasNode[] = allTables.map((t, i) => {
    const whereChips = (whereByAlias[t.alias] ?? []).map(([, column, , operator, val]) => {
      const literal = val && 'value' in val ? `${val.value}` : '';
      return `${column} ${operator} ${literal}`.trim();
    });
    const data: CanvasTableNodeData = {
      alias: t.alias,
      table: t.table,
      schema: t.schema,
      order: i + 1,
      isCurrent: t.alias === ast.current,
      removable: i === allTables.length - 1,
      selectColumns: (selectByAlias[t.alias] ?? [])
        .map(c => c.column)
        .filter(column => !groupedColumnNamesByAlias[t.alias]?.has(column)),
      whereChips,
      orderChips: (orderByAlias[t.alias] ?? []).map(o => `${o.column} ${o.direction}`),
      groupChips: (groupByAlias[t.alias] ?? []).map(g => g.column),
      leftHandles: toHandles(leftHandlesByAlias[t.alias]),
      rightHandles: toHandles(rightHandlesByAlias[t.alias]),
    };
    return { id: t.alias, type: 'table-node', position: { x: 0, y: 0 }, data };
  });

  return { nodes, edges };
};

const verticalGap = 24;

/**
 * Every table node's y, stacked strictly by pipeline sequence (data.order) -
 * node 2 always sits below node 1, node 3 below node 2, and so on, regardless
 * of which rank (x) each one lands on. Dagre's own y (crossing-minimization
 * within a rank) is free to put a later table above an earlier one - fine
 * for a generic graph, but here the vertical axis is also "which one came
 * first", so a later join floating above the table it came from reads as
 * backwards. x is untouched - which side of the graph a node lands on
 * (parent left, child right) still comes entirely from dagre's rank axis.
 */
const sequenceYByAlias = (nodes: CanvasNode[]): Record<string, number> => {
  const tableNodes = nodes
    .filter((n): n is CanvasTableNode => n.type === 'table-node')
    .sort((a, b) => a.data.order - b.data.order);
  const sequenceY: Record<string, number> = {};
  let runningY = 0;
  for (const n of tableNodes) {
    sequenceY[n.id] = runningY;
    runningY += getNodeFootprintHeight(n) + verticalGap;
  }
  return sequenceY;
};

const layoutNodes = (
  positions: Record<string, { x: number; y: number }>,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): CanvasNode[] => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 24 });
  nodes.forEach(n => g.setNode(n.id, { width: nodeWidth, height: getNodeFootprintHeight(n) }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);

  const sequenceY = sequenceYByAlias(nodes);

  return nodes.map(n => {
    const cached = positions[n.id];
    const position =
      cached ??
      (() => {
        const p = g.node(n.id);
        if (!p) return { x: 0, y: 0 };
        // The footprint (not getNodeHeight alone) so the position offset
        // agrees with what dagre actually reserved space for - position.y
        // ends up at the top of the action bar, the true top of what
        // TableNode.tsx renders at this node. sequenceY is already a top
        // offset (see sequenceYByAlias), unlike dagre's own p.y (a center),
        // so only the fallback (the start node, which has no sequence)
        // needs the center-to-top conversion.
        const y = sequenceY[n.id] ?? p.y - getNodeFootprintHeight(n) / 2;
        return { x: p.x - nodeWidth / 2, y };
      })();
    return { ...n, position, targetPosition: Position.Left, sourcePosition: Position.Right };
  });
};

export const buildCanvasGraph = (
  ast: Ast,
  positions: Record<string, { x: number; y: number }>,
): CanvasGraph => {
  const { nodes, edges } = deriveGraph(ast);
  return { nodes: layoutNodes(positions, nodes, edges), edges, parsing: true, singleBlock: true };
};
