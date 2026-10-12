import dagre from 'dagre';
import { Position } from 'reactflow';
import {
  Ast,
  Checkpoint,
  CheckpointColumn,
  Column,
  columnName,
  GroupColumn,
  Join,
  OrderColumn,
  NamedResultAst,
  WhereEntry,
  whereConditions,
  whereLiteral,
} from '../client';
import {
  CanvasDividerNode,
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
// needs (no suggested/candidate nodes). Node height, like the pre-existing
// graph, is sized from handle rows only - the select/where/order chip rows
// below the box grow the DOM element without a matching dagre height, same
// trade-off the existing graph accepts (see store/graph.util.ts's
// getNodeHeight).

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
// trade-off as the chip rows below the box (see the file header).
const actionBarHeight = 28;

const effectiveHandleCount = (handles: CanvasHandle[]): number =>
  handles.length > 1 || (handles.length === 1 && handles[0].column !== '') ? handles.length : 0;

// A checkpoint's node lists its result's columns, one per row. A wide table
// sealed by `limit: 10` has dozens, so only the first few are listed, plus
// every column a join uses (its handle sits on that column's row).
const maxCheckpointRows = 8;

/**
 * The rows a checkpoint's node lists: its first columns, then any other
 * column a join handle needs, and how many columns are left out. Shared by
 * TableNode.tsx (which draws them) and getNodeHeight (which sizes the node),
 * so the two agree.
 */
export const checkpointRows = (data: CanvasTableNodeData): { columns: string[]; hidden: number } => {
  const all = data.checkpoint?.columns ?? [];
  const joined = new Set([...data.leftHandles, ...data.rightHandles].map(h => h.column).filter(Boolean));
  const shown = all.filter((column, i) => i < maxCheckpointRows || joined.has(column));
  const extra = Array.from(joined).filter(column => !all.includes(column));
  return { columns: [...shown, ...extra], hidden: all.length - shown.length };
};

/**
 * The identity box's own height - what TableNode.tsx sets as its minHeight.
 * `node.type` isn't a literal-discriminated field on reactflow's `Node<T>`,
 * so TS can't narrow the union from it alone - an explicit cast, same as
 * this function always needed.
 */
export const getNodeHeight = (node: CanvasNode): number => {
  if (node.type !== 'table-node') return startNodeHeight;
  const data = node.data as CanvasTableNodeData;
  if (data.checkpoint) {
    const { columns, hidden } = checkpointRows(data);
    const rows = columns.length + (hidden > 0 ? 1 : 0);
    return rows === 0 ? minNodeHeight : headerHeight + rows * handleRowHeight + 10;
  }
  const rows = Math.max(effectiveHandleCount(data.leftHandles), effectiveHandleCount(data.rightHandles));
  return rows === 0 ? minNodeHeight : headerHeight + rows * handleRowHeight + 10;
};

// The chip rows (sel/where/order/group) below a node's box. A rough estimate,
// not a measurement: about two chips to a line at nodeWidth. Counted so that
// the next node in a stage, and a checkpoint's divider below the stage,
// don't sit on top of them.
const chipRowHeight = 22;
const chipsHeight = (data: CanvasTableNodeData): number =>
  [data.selectColumns, data.whereChips, data.orderChips, data.groupChips].reduce(
    (height, chips) => (chips.length ? height + chipRowHeight * Math.ceil(chips.length / 2) : height),
    0,
  );

/** Total on-screen footprint - what dagre needs for spacing. Only table nodes reserve actionBarHeight and their chips. */
const getNodeFootprintHeight = (node: CanvasNode): number =>
  node.type === 'table-node'
    ? getNodeHeight(node) + actionBarHeight + chipsHeight(node.data as CanvasTableNodeData)
    : getNodeHeight(node);

const byAlias = <T,>(items: T[], aliasOf: (item: T) => string): Record<string, T[]> => {
  const acc: Record<string, T[]> = {};
  for (const item of items) {
    const alias = aliasOf(item);
    (acc[alias] ??= []).push(item);
  }
  return acc;
};

type HandleMaps = {
  left: Record<string, Map<string, CanvasHandle>>;
  right: Record<string, Map<string, CanvasHandle>>;
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
 * Walks one stage's joins list into edges/handles - the same handle naming
 * and uncertain/unresolved flagging for every stage.
 */
// Join.type is typed as plain `string | null` (client.ts) since it's an
// untyped wire value - pine-lang only ever actually sends 'LEFT'/'RIGHT'/nil
// (see eval.clj's join-keyword), but nothing upstream enforces that in TS.
// Narrows defensively rather than asserting, so an unexpected future value
// degrades to "render as inner" instead of silently mistyping CanvasEdge.
const asJoinType = (value: string | null): 'LEFT' | 'RIGHT' | null =>
  value === 'LEFT' || value === 'RIGHT' ? value : null;

const addJoins = (
  joins: Join[],
  handles: HandleMaps,
  edges: CanvasEdge[],
  // A join naming a checkpoint's own name directly (a table joined onto a
  // sealed group:/limit: output) has no table segment of its own for
  // pine-actions.ts's setJoinType to find - the checkpoint is an `= name`
  // assign, not a `table` segment with a `:left`/`:right` modifier slot.
  // Leaving `joinTargetAlias` unset for that case (rather than pointing it
  // at a name setJoinType can never resolve) is what keeps TraceEdge from
  // rendering a click target that always silently no-ops.
  isCheckpointName: (name: string) => boolean,
): void => {
  for (const join of joins) {
    const { from: fromAlias, to: toAlias, columns, resolution } = join;
    const joinType = asJoinType(join.type);
    const joinTargetAlias = isCheckpointName(toAlias) ? undefined : toAlias;
    // An unresolved join - nothing connects the two tables, or an explicit
    // join-column no longer matches any real reference (e.g. a canvas edit
    // retargeted this join onto a different upstream table after the one in
    // between was deleted). It has one spelling: a null resolution, and no
    // column pairs to draw handles from.
    if (!resolution) {
      // Unresolved join (see pipeline.md) - still shown, flagged, rather than silently dropped.
      edges.push({
        id: `${fromAlias}-${toAlias}`,
        source: fromAlias,
        target: toAlias,
        unresolved: true,
        joinType,
        joinTargetAlias,
      });
      continue;
    }
    const parentIsFrom = join.parent === 'from';
    const fromNode = parentIsFrom ? fromAlias : toAlias;
    const toNode = parentIsFrom ? toAlias : fromAlias;
    // A foreign key made of several columns is one join with several pairs.
    // The edge is drawn from the first - the pair the join is named by - and
    // every pair gets a handle, so each column the join actually uses shows
    // on its own table.
    const oriented = columns.map(({ from, to }) =>
      parentIsFrom ? { parent: from, child: to } : { parent: to, child: from },
    );
    for (const { parent, child } of oriented) {
      addHandle(handles.right, fromNode, parent, 'r', toNode);
      addHandle(handles.left, toNode, child, 'l', fromNode);
    }
    const [{ parent: parentCol, child: childCol }] = oriented;
    const uncertain = resolution === 'heuristic' || resolution === 'synthetic';
    edges.push({
      id: `${fromNode}->${toNode}:${parentCol}=${childCol}`,
      source: fromNode,
      target: toNode,
      sourceHandle: `r:${parentCol}`,
      targetHandle: `l:${childCol}`,
      ...(uncertain ? { uncertain: true } : {}),
      // Always toAlias (via joinTargetAlias above), not toNode - see
      // CanvasEdge.joinTargetAlias's own comment for why these two can
      // differ (a "belongs to" relation swaps fromNode/toNode for layout,
      // but the `:left`/`:right` modifier stays on whichever table
      // the join's own `to` names, regardless of which side of the screen it
      // renders on).
      joinType,
      joinTargetAlias,
    });
  }
};

// Table.schema (client.ts) is typed non-null - accurate for a fully
// resolved, already-selected table, but the in-progress table below is
// synthesized from operation.value, which can genuinely be null. Widening
// Table.schema itself ripples into model.d.ts's VariableInnerTable (out of
// bounds - see the plan doc's untouched-files list), so this stays a local,
// canvas-only shape instead.
type CanvasTableRef = { schema: string | null; table: string; alias: string };

/** What one stage is drawn from: a checkpoint's snapshot, or the live AST for the last stage. */
type StageSource = {
  tables: CanvasTableRef[];
  joins: Join[];
  columns: Column[];
  where: WhereEntry[];
  order: OrderColumn[];
  group: GroupColumn[];
};

/**
 * One stage of the pipeline: the tables between two checkpoints. `after` is
 * the checkpoint the stage starts from - its node is the stage's first node,
 * and the tables joined onto its sealed result are in this stage too.
 * `removable` is whether its tables can be removed: not inside a sealed
 * checkpoint, where removing one could break the checkpoint's own group:
 * or joins in ways a segment removal doesn't account for.
 */
type Stage = { source: StageSource; after?: Checkpoint; removable: boolean };

const emptySource: StageSource = { tables: [], joins: [], columns: [], where: [], order: [], group: [] };

const fromSnapshot = (snapshot: NamedResultAst): StageSource => ({
  tables: snapshot.tables ?? snapshot['selected-tables'] ?? [],
  joins: snapshot.joins ?? [],
  columns: snapshot.columns ?? [],
  where: snapshot.where ?? [],
  order: snapshot.order ?? [],
  group: snapshot.group ?? [],
});

/**
 * The pipeline's stages, top to bottom. A sealed checkpoint's stage comes
 * from its snapshot (`ast['pending-assignments'][name]`); the stage after
 * the last sealed checkpoint comes from the live AST. A checkpoint still
 * pending at the end seals the live stage, and is followed by a stage with
 * only its own node.
 */
const stagesOf = (ast: Ast): Stage[] => {
  // The table currently being typed is deliberately excluded from
  // `ast['selected-tables']` while `operation.type === 'table'` (see
  // pipeline.md - "the last table is excluded ... intended for the live
  // graph"). Its identity comes from the shared `inProgressTable` helper in
  // pine-text.ts, which uses `ast.current` (always the real alias, whether
  // auto-generated or explicit) rather than `operation.value.alias` (only
  // present once the user has actually typed `as ...`).
  const selectedTables: CanvasTableRef[] = ast['selected-tables'] ?? [];
  const inProgress = inProgressTable(ast);
  const live: StageSource = {
    tables:
      inProgress && !selectedTables.some(t => t.alias === inProgress.alias)
        ? [...selectedTables, inProgress]
        : selectedTables,
    joins: ast.joins ?? [],
    columns: ast.columns ?? [],
    where: ast.where ?? [],
    // See the `order: Column[]` comment in client.ts - the real wire shape is OrderColumn.
    order: (ast.order ?? []) as unknown as OrderColumn[],
    group: ast.group ?? [],
  };
  const checkpoints = ast.checkpoints ?? [];
  const stages: Stage[] = checkpoints.map((checkpoint, k) => {
    const after = checkpoints[k - 1];
    if (!checkpoint.sealed) return { source: live, after, removable: true };
    const snapshot = ast['pending-assignments']?.[checkpoint.name];
    return { source: snapshot ? fromSnapshot(snapshot) : emptySource, after, removable: false };
  });
  const last = checkpoints[checkpoints.length - 1];
  if (!last) stages.push({ source: live, removable: true });
  else if (last.sealed) stages.push({ source: live, after: last, removable: true });
  else stages.push({ source: emptySource, after: last, removable: false });
  return stages;
};

/** What a checkpoint's divider says: `limit 10`, `limit 1 per c.id`, `group t.title → count`. */
const columnLabel = (c: CheckpointColumn): string => `${c.alias}.${columnName(c.column, c.path)}`;
export const checkpointLabel = (checkpoint: Checkpoint): string => {
  if (checkpoint.kind === 'limit') {
    const per = checkpoint.per?.length ? ` per ${checkpoint.per.map(columnLabel).join(', ')}` : '';
    return `limit ${checkpoint.limit ?? ''}${per}`;
  }
  const aggregates = checkpoint.aggregates?.length ? ` → ${checkpoint.aggregates.join(', ')}` : '';
  return `group ${(checkpoint.group ?? []).map(columnLabel).join(', ')}${aggregates}`;
};

/**
 * One stage -> nodes/edges (no positions yet), mirroring generateGraph's
 * join direction logic (store/graph.util.ts). `order` numbers every node in
 * the pipeline top to bottom, starting at `firstOrder` - it drives the
 * vertical stacking within the stage and CanvasStore's keyboard order.
 */
const deriveStage = (
  stage: Stage,
  checkpointNames: Set<string>,
  firstOrder: number,
): { nodes: CanvasTableNode[]; edges: CanvasEdge[] } => {
  const { source, after } = stage;
  const selectByAlias = byAlias(source.columns.filter(c => !c.hidden && !!c.column), c => c.alias);
  // An `or` group belongs to the table of its first condition - one chip,
  // on one node, even when its conditions name several tables.
  const whereByAlias = byAlias(source.where, w => whereConditions(w)[0].alias);
  const orderByAlias = byAlias(source.order, o => o.alias);
  const groupByAlias = byAlias(source.group, g => g.alias);
  // pine-lang merges every group: column into the columns too - required so
  // the generated SQL's SELECT list actually includes what it groups by, not
  // a canvas-specific quirk. Left unfiltered, a grouped column would render
  // under BOTH the "sel" and "group" chip rows. "sel" excludes anything
  // already shown under "group" for that same alias.
  const groupedColumnNamesByAlias: Record<string, Set<string>> = {};
  for (const [alias, cols] of Object.entries(groupByAlias)) {
    groupedColumnNamesByAlias[alias] = new Set(cols.map(g => columnName(g.column, g.path)));
  }

  const handles: HandleMaps = { left: {}, right: {} };
  const edges: CanvasEdge[] = [];
  addJoins(source.joins, handles, edges, name => checkpointNames.has(name));

  const chipsFor = (alias: string) => ({
    selectColumns: (selectByAlias[alias] ?? [])
      .map(c => columnName(c.column, c.path))
      .filter(column => !groupedColumnNamesByAlias[alias]?.has(column)),
    whereChips: (whereByAlias[alias] ?? []).map(entry =>
      whereConditions(entry)
        .map(({ alias: conditionAlias, column, path, operator, value: val }) => {
          // A $variable shows as `$name`: the tab builds without its value.
          const literal = whereLiteral(val);
          // Another table's column in the same group keeps its alias, so the
          // chip doesn't read as this table's.
          const name =
            conditionAlias === alias ? columnName(column, path) : `${conditionAlias}.${columnName(column, path)}`;
          return `${name} ${operator} ${literal}`.trim();
        })
        .join(' or '),
    ),
    orderChips: (orderByAlias[alias] ?? []).map(o => `${columnName(o.column, o.path)} ${o.direction}`),
    groupChips: (groupByAlias[alias] ?? []).map(g => columnName(g.column, g.path)),
    leftHandles: toHandles(handles.left[alias]),
    rightHandles: toHandles(handles.right[alias]),
  });

  const nodes: CanvasTableNode[] = [];
  let order = firstOrder;
  if (after) {
    // The checkpoint's sealed result, named exactly as pine-lang reports it.
    // Its id is that name too: the alias every join onto it, and every
    // select/where/order on it, already uses.
    nodes.push({
      id: after.name,
      type: 'table-node',
      position: { x: 0, y: 0 },
      data: {
        alias: after.name,
        table: after.name,
        schema: null,
        order: order++,
        removable: false,
        ...chipsFor(after.name),
        checkpoint: { columns: after.columns },
      },
    });
  }
  // A table named after a checkpoint is that checkpoint's CTE - drawn as the
  // checkpoint's own node above, not as a table.
  for (const t of source.tables.filter(t => !checkpointNames.has(t.table))) {
    nodes.push({
      id: t.alias,
      type: 'table-node',
      position: { x: 0, y: 0 },
      data: {
        alias: t.alias,
        table: t.table,
        schema: t.schema,
        order: order++,
        // Any top-level table can be removed, not just the last one -
        // pine-text.ts's removeNode handles an interior one. A table inside
        // a sealed checkpoint can't (see Stage).
        removable: stage.removable,
        ...chipsFor(t.alias),
      },
    });
  }
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
const sequenceYByAlias = (nodes: CanvasTableNode[]): Record<string, number> => {
  const sorted = [...nodes].sort((a, b) => a.data.order - b.data.order);
  const sequenceY: Record<string, number> = {};
  let runningY = 0;
  for (const n of sorted) {
    sequenceY[n.id] = runningY;
    runningY += getNodeFootprintHeight(n) + verticalGap;
  }
  return sequenceY;
};

/** Lays out one stage on its own: x from dagre's left-to-right ranks, y by sequence, both starting at 0. */
const layoutStage = (nodes: CanvasTableNode[], edges: CanvasEdge[]): CanvasTableNode[] => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 24 });
  nodes.forEach(n => g.setNode(n.id, { width: nodeWidth, height: getNodeFootprintHeight(n) }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);
  const sequenceY = sequenceYByAlias(nodes);
  const placed = nodes.map(n => {
    const p = g.node(n.id);
    return {
      ...n,
      position: { x: p ? p.x - nodeWidth / 2 : 0, y: sequenceY[n.id] ?? 0 },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    };
  });
  const minX = Math.min(...placed.map(n => n.position.x));
  return placed.map(n => ({ ...n, position: { x: n.position.x - minX, y: n.position.y } }));
};

// A checkpoint's divider: the space it takes between two stages, and how far
// its line reaches past the nodes on either side.
const dividerGap = 20;
const dividerHeight = 24;
const dividerOverhang = 24;
const minDividerWidth = 320;

/**
 * ast -> laid-out nodes/edges. The pipeline is drawn as stages stacked top
 * to bottom (see stagesOf). Within a stage, tables keep the left-to-right
 * layout. Each checkpoint is a dashed divider across the whole width, below
 * the stage it seals, and the node named after it starts the next stage.
 *
 * `positions` holds nodes the user has dragged: they keep that position.
 */
export const buildCanvasGraph = (ast: Ast, positions: Record<string, { x: number; y: number }>): CanvasGraph => {
  const checkpoints = ast.checkpoints ?? [];
  const checkpointNames = new Set(checkpoints.map(c => c.name));
  const stages = stagesOf(ast);

  const laidOut: CanvasTableNode[] = [];
  const edges: CanvasEdge[] = [];
  const stageBottoms: number[] = [];
  let top = 0;
  let order = 1;
  for (const stage of stages) {
    const derived = deriveStage(stage, checkpointNames, order);
    order += derived.nodes.length;
    const placed = layoutStage(derived.nodes, derived.edges).map(n => ({
      ...n,
      position: { x: n.position.x, y: n.position.y + top },
    }));
    const bottom = placed.length ? Math.max(...placed.map(n => n.position.y + getNodeFootprintHeight(n))) : top;
    laidOut.push(...placed);
    edges.push(...derived.edges);
    stageBottoms.push(bottom);
    top = bottom + dividerGap * 2 + dividerHeight;
  }

  const maxX = laidOut.length ? Math.max(...laidOut.map(n => n.position.x + nodeWidth)) : nodeWidth;
  const width = Math.max(maxX + dividerOverhang * 2, minDividerWidth);
  const dividers: CanvasDividerNode[] = checkpoints.map((checkpoint, k) => ({
    id: `checkpoint-divider:${checkpoint.name}`,
    type: 'checkpoint-divider',
    position: { x: -dividerOverhang, y: stageBottoms[k] + dividerGap },
    draggable: false,
    selectable: false,
    focusable: false,
    // ReactFlow's own wrapper around the node would otherwise take every
    // click along the line's whole width - including the mousedown that
    // starts a rubber-band selection. The label and remove button opt back
    // in (see CheckpointDividerNode.tsx).
    style: { pointerEvents: 'none' },
    data: {
      name: checkpoint.name,
      label: checkpointLabel(checkpoint),
      limit: checkpoint.kind === 'limit' ? checkpoint.limit : undefined,
      width,
    },
  }));

  const nodes = laidOut.map(n => (positions[n.id] ? { ...n, position: positions[n.id] } : n));
  return { nodes: [...dividers, ...nodes], edges, parsing: true, singleBlock: true };
};
