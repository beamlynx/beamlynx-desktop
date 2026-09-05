import dagre from 'dagre';
import { Position } from 'reactflow';
import { Ast, GroupColumn, JoinTuple, OrderColumn, VariableAst } from '../client';
import {
  CanvasEdge,
  CanvasFrameNode,
  CanvasGraph,
  CanvasHandle,
  CanvasNode,
  CanvasTableNode,
  CanvasTableNodeData,
  PENDING_CHECKPOINT_FRAME_ID,
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

/**
 * The identity box's own height - what TableNode.tsx sets as its minHeight.
 * `node.type` isn't a literal-discriminated field on reactflow's `Node<T>`,
 * so TS can't narrow the union from it alone - an explicit cast, same as
 * this function always needed.
 */
export const getNodeHeight = (node: CanvasNode): number => {
  if (node.type !== 'table-node') return startNodeHeight;
  const data = node.data as CanvasTableNodeData;
  const rows = Math.max(effectiveHandleCount(data.leftHandles), effectiveHandleCount(data.rightHandles));
  return rows === 0 ? minNodeHeight : headerHeight + rows * handleRowHeight + 10;
};

/** Total on-screen footprint - what dagre needs for spacing. Only table nodes reserve actionBarHeight. */
const getNodeFootprintHeight = (node: CanvasNode): number =>
  node.type === 'table-node' ? getNodeHeight(node) + actionBarHeight : getNodeHeight(node);

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
 * Walks one joins list (either ast.joins, or a sealed checkpoint's own
 * inner joins - see the checkpoint branch in deriveGraph below) into
 * edges/handles. Extracted so a checkpoint's inner joins (tenant<->company)
 * get exactly the same treatment as the outer pipeline's - same handle
 * naming, same uncertain/unresolved flagging - rather than a second,
 * drifting copy of this logic.
 */
// JoinTuple[3] is typed as plain `string | null` (client.ts) since it's an
// untyped wire value - pine-lang only ever actually sends 'LEFT'/'RIGHT'/nil
// (see eval.clj's join-keyword), but nothing upstream enforces that in TS.
// Narrows defensively rather than asserting, so an unexpected future value
// degrades to "render as inner" instead of silently mistyping CanvasEdge.
const asJoinType = (value: string | null): 'LEFT' | 'RIGHT' | null =>
  value === 'LEFT' || value === 'RIGHT' ? value : null;

const addJoins = (
  joins: JoinTuple[],
  handles: HandleMaps,
  edges: CanvasEdge[],
  // A join naming a checkpoint's own pinned name directly (a table joined
  // onto a sealed group:/limit: output - see deriveGraph's own comment on
  // `rankAnchors`/`t.table`) has no table segment of its own for
  // pine-actions.ts's setJoinType to find - the checkpoint is an `= name`
  // assign, not a `table` segment with a `:left`/`:right` modifier slot.
  // Leaving `joinTargetAlias` unset for that case (rather than pointing it
  // at a name setJoinType can never resolve) is what keeps TraceEdge from
  // rendering a click target that always silently no-ops.
  isCheckpointName: (name: string) => boolean,
): void => {
  for (const [fromAlias, toAlias, relation, rawJoinType] of joins) {
    const joinType = asJoinType(rawJoinType);
    const joinTargetAlias = isCheckpointName(toAlias) ? undefined : toAlias;
    // pine-lang can return a "hint-less" relation - not null, but with
    // col/f-col/resolution all nil - when an explicit join-column no longer
    // matches any real reference (e.g. a canvas edit retargeted this join
    // onto a different upstream table after the one in between was deleted;
    // see join-helper's comment in pine-lang's src/pine/ast/table.clj). That's
    // exactly as unresolved as `relation` being null outright - treating it
    // as a confident, solid join rendered a structurally broken one as if it
    // were certain, and fed null column names into the handles below.
    if (!relation || !relation[5]) {
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
    const parentIsFrom = relation[2] === 'has';
    const fromNode = parentIsFrom ? fromAlias : toAlias;
    const toNode = parentIsFrom ? toAlias : fromAlias;
    const [, col1, , , col2, resolution] = relation;
    // col1/col2 are only null on the hint-less relation already filtered out
    // above (pine-lang's join-helper never returns a truthy resolution
    // alongside a null column - see the type's comment in client.ts) - safe
    // to assert non-null here.
    const [parentCol, childCol] = parentIsFrom ? [col1!, col2!] : [col2!, col1!];
    addHandle(handles.right, fromNode, parentCol, 'r', toNode);
    addHandle(handles.left, toNode, childCol, 'l', fromNode);
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
      // JoinTuple's own [1] names, regardless of which side of the screen it
      // renders on).
      joinType,
      joinTargetAlias,
    });
  }
};

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

/**
 * A selected-tables entry whose `.table` matches a key in `ast.variables`
 * (assigned in an earlier expression) or `ast['pending-assignments']`
 * (sealed within this one) is a checkpoint's CTE, not a real table -
 * `seal-as-cte` (pine-lang's ast/main.clj) injects the checkpoint's own name
 * as both `table` and `alias` when it replaces a table op, so this lookup by
 * `.table` is exactly the same alias the rest of this expression (joins,
 * select/where/order) already addresses it by.
 */
const checkpointFor = (ast: Ast, tableName: string): VariableAst | undefined =>
  ast.variables?.[tableName] ?? ast['pending-assignments']?.[tableName];

/** A checkpoint that has replaced a selected-tables slot - its inner tables render as their own nodes, wrapped in a frame (see makeFrameNode). */
export type FrameSpec = { id: string; memberIds: string[]; leftHandles: CanvasHandle[]; rightHandles: CanvasHandle[] };

/** A dagre-only edge, never rendered - see deriveGraph's rankEdges for why these exist. */
type RankEdge = { source: string; target: string };

const deriveGraph = (
  ast: Ast,
): { nodes: CanvasNode[]; edges: CanvasEdge[]; frames: FrameSpec[]; rankAnchors: string[]; rankEdges: RankEdge[] } => {
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

  const handles: HandleMaps = { left: {}, right: {} };
  const edges: CanvasEdge[] = [];
  addJoins(ast.joins ?? [], handles, edges, name => !!checkpointFor(ast, name));

  const nodes: CanvasNode[] = [];
  const frames: FrameSpec[] = [];
  const rankAnchors: string[] = [];
  const rankEdges: RankEdge[] = [];

  for (let i = 0; i < allTables.length; i++) {
    const t = allTables[i];
    const checkpoint = checkpointFor(ast, t.table);
    if (checkpoint) {
      // The inner tables render as their own normal, fully-interactive
      // table nodes - never collapsed into a summary card (see the plan
      // doc's container-node follow-up pass: a first version did exactly
      // that, and it was explicitly rejected - the user wants tenant/
      // company to stay visible and actionable even once something is
      // composed on top of the seal). `tables` (the raw accumulation) is
      // used over `selected-tables` for the same reason store/graph.util.
      // ts's makeVariableNodes does: `selected-tables` strips the last
      // table while it's still being typed, never what a *sealed*
      // checkpoint's inner list should reflect. Excludes an inner table
      // that is itself another checkpoint's CTE (a chained/nested
      // checkpoint) - real, out of scope for now (see the plan doc).
      const innerTables = (checkpoint.tables ?? checkpoint['selected-tables'] ?? []).filter(
        it => !checkpointFor(ast, it.table),
      );
      addJoins(checkpoint.joins ?? [], handles, edges, name => !!checkpointFor(ast, name));
      // checkpoint.columns tells us what each inner alias contributed to
      // the sealed output - but VariableAst has no equivalent of ast.where/
      // ast.order/ast.group, so where/order chips and the select-vs-group
      // distinction are genuinely unrecoverable once sealed. Shown under
      // "sel" only, not split - an honest simplification, not a bug to
      // chase, given the AST just doesn't carry the rest.
      const innerSelectByAlias = byAlias(
        (checkpoint.columns ?? []).filter(c => !c.hidden && !!c.column),
        c => c.alias,
      );
      const memberIds: string[] = [];
      for (const it of innerTables) {
        const data: CanvasTableNodeData = {
          alias: it.alias,
          table: it.table,
          schema: it.schema,
          // Same integer as the outer slot this checkpoint replaced, for
          // every inner table - Array.prototype.sort is stable (ES2019+),
          // so sequenceYByAlias still stacks them in `innerTables`' own
          // order relative to each other even with tied values. Purely
          // structural now (vertical position + CanvasStore's keyboard-nav
          // ordering) - no longer separately rendered as a visible badge.
          order: i + 1,
          // Deleting a table from inside a sealed checkpoint isn't
          // supported yet - it could break the checkpoint's own join graph
          // in ways a simple segment removal doesn't account for.
          removable: false,
          selectColumns: (innerSelectByAlias[it.alias] ?? []).map(c => c.column),
          whereChips: [],
          orderChips: [],
          groupChips: [],
          leftHandles: toHandles(handles.left[it.alias]),
          rightHandles: toHandles(handles.right[it.alias]),
        };
        nodes.push({ id: it.alias, type: 'table-node', position: { x: 0, y: 0 }, data });
        memberIds.push(it.alias);
      }
      // `t.table` - the checkpoint's own pinned name - not a synthetic
      // frame-specific id: it's exactly the alias a join onto the sealed
      // output addresses in ast.joins (confirmed live - `group: c.id |=
      // agg | company_officer` produces a join tuple naming "agg"
      // directly), so the frame can only act as that join's anchor if it
      // shares that same id. Handles come from the very same handles.left/
      // right maps addJoins already populated for every other alias - a
      // join targeting "agg" needs no special-casing there at all.
      if (memberIds.length) {
        frames.push({
          id: t.table,
          memberIds,
          leftHandles: toHandles(handles.left[t.table]),
          rightHandles: toHandles(handles.right[t.table]),
        });
        // The checkpoint's own identity (t.table, e.g. "agg") is never
        // rendered as a node - the frame is a decoration sized from its
        // inner tables' own laid-out positions - but ast.joins can still
        // name it directly as a source (a table joined onto the sealed
        // output). Without a real anchor here, dagre has no edge
        // connecting "agg" to the inner cluster at all (checkpoint.joins,
        // added above via addJoins, only wires the inner tables to EACH
        // OTHER, never to the checkpoint's own name) - dagre.setEdge then
        // implicitly creates "agg" as an unconnected phantom node ranked
        // from 0 on its own, same as the inner cluster's own rank-0 start.
        // Found live: a table joined onto the checkpoint rendered
        // directly in the same column as one of the inner tables, purely
        // because their ranks coincided by chance. `rankAnchors`/
        // `rankEdges` are dagre-ranking-only (see layoutNodes) - they
        // never appear in the returned `nodes`/`edges`, so nothing new
        // renders because of them.
        rankAnchors.push(t.table);
        for (const memberId of memberIds) {
          rankEdges.push({ source: memberId, target: t.table });
        }
      }
      continue;
    }
    const whereChips = (whereByAlias[t.alias] ?? []).map(([, column, , operator, val]) => {
      const literal = val && 'value' in val ? `${val.value}` : '';
      return `${column} ${operator} ${literal}`.trim();
    });
    const data: CanvasTableNodeData = {
      alias: t.alias,
      table: t.table,
      schema: t.schema,
      order: i + 1,
      // Any top-level table can be removed, not just the last one -
      // pine-text.ts's removeNode pins a dangling from: where needed so a
      // downstream implicit join fails visibly instead of silently
      // re-targeting. Checkpoint-inner tables are the one exception, still
      // gated `false` above - a separate, harder problem.
      removable: true,
      selectColumns: (selectByAlias[t.alias] ?? [])
        .map(c => c.column)
        .filter(column => !groupedColumnNamesByAlias[t.alias]?.has(column)),
      whereChips,
      orderChips: (orderByAlias[t.alias] ?? []).map(o => `${o.column} ${o.direction}`),
      groupChips: (groupByAlias[t.alias] ?? []).map(g => g.column),
      leftHandles: toHandles(handles.left[t.alias]),
      rightHandles: toHandles(handles.right[t.alias]),
    };
    nodes.push({ id: t.alias, type: 'table-node', position: { x: 0, y: 0 }, data });
  }

  return { nodes, edges, frames, rankAnchors, rankEdges };
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
  rankAnchors: string[] = [],
  rankEdges: RankEdge[] = [],
): CanvasNode[] => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 24 });
  nodes.forEach(n => g.setNode(n.id, { width: nodeWidth, height: getNodeFootprintHeight(n) }));
  // Dagre-ranking-only anchors for a checkpoint's own identity (see
  // deriveGraph's rankAnchors/rankEdges comment) - never part of `nodes`,
  // so `nodes.map(...)` below can never return one of these; they exist
  // purely so a table joined onto the checkpoint ranks after the whole
  // inner cluster instead of as an unconnected phantom dagre node.
  rankAnchors.forEach(id => g.setNode(id, { width: nodeWidth, height: minNodeHeight }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  rankEdges.forEach(e => g.setEdge(e.source, e.target));
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

const framePadding = 16;
const frameHeaderHeight = 30;

/**
 * Background frame wrapping a specific set of already-laid-out nodes -
 * sized to their bounding box, drawn behind them (zIndex -1). Used for two
 * different situations that both end up needing "a border around some
 * table nodes, with its own action bar": a pipeline whose trailing
 * group:/limit: hasn't been composed on top of yet (CanvasStore.recompute's
 * hasTrailingCheckpoint check - `memberIds` is every currently-rendered
 * table node in that case), and a checkpoint that HAS been composed on top
 * of, whose inner tables now render as their own nodes rather than a
 * collapsed summary (deriveGraph's `frames` output - `memberIds` is just
 * that checkpoint's own inner tables).
 */
const makeFrameNode = (
  id: string,
  laidOutNodes: CanvasNode[],
  memberIds: string[],
  leftHandles: CanvasHandle[] = [],
  rightHandles: CanvasHandle[] = [],
): CanvasFrameNode | null => {
  const members = new Set(memberIds);
  const memberNodes = laidOutNodes.filter(
    (n): n is CanvasTableNode => n.type === 'table-node' && members.has(n.id),
  );
  if (memberNodes.length === 0) return null;
  const boxes = memberNodes.map(n => ({
    x: n.position.x,
    y: n.position.y,
    width: nodeWidth,
    height: getNodeFootprintHeight(n),
  }));
  const memberOrder = Math.max(...memberNodes.map(n => n.data.order));
  const minX = Math.min(...boxes.map(b => b.x));
  const minY = Math.min(...boxes.map(b => b.y));
  const maxX = Math.max(...boxes.map(b => b.x + b.width));
  const maxY = Math.max(...boxes.map(b => b.y + b.height));
  return {
    id,
    type: 'frame-node',
    position: { x: minX - framePadding, y: minY - framePadding - frameHeaderHeight },
    draggable: false,
    selectable: false,
    // ReactFlow renders its own `.react-flow__node` wrapper AROUND
    // whatever FrameNode.tsx returns - `pointerEvents: 'none'` set only on
    // FrameNode's own root div doesn't make THAT wrapper transparent too,
    // since a child's pointer-events:none doesn't propagate to its parent.
    // The wrapper stays hit-testable (it has to - the action bar's clicks
    // need to reach it) and, unless told otherwise, keeps whatever cursor
    // ReactFlow's own default node styling applies - reported live as a
    // stray pointer/grab cursor across the whole frame even off the
    // buttons, which an inner-div-only fix couldn't reach. `style` is a
    // real top-level Node field ReactFlow applies directly to that
    // wrapper, so this reaches the one element the inner fix couldn't.
    style: { pointerEvents: 'none' },
    zIndex: -1,
    data: {
      width: maxX - minX + framePadding * 2,
      height: maxY - minY + framePadding * 2 + frameHeaderHeight,
      leftHandles,
      rightHandles,
      memberOrder,
    },
  };
};

export const buildCanvasGraph = (
  ast: Ast,
  positions: Record<string, { x: number; y: number }>,
  hasPendingCheckpoint: boolean,
): CanvasGraph => {
  const { nodes, edges, frames, rankAnchors, rankEdges } = deriveGraph(ast);
  const laidOut = layoutNodes(positions, nodes, edges, rankAnchors, rankEdges);

  const consumedFrames = frames
    .map(f => makeFrameNode(f.id, laidOut, f.memberIds, f.leftHandles, f.rightHandles))
    .filter((f): f is CanvasFrameNode => f !== null);

  // The pending frame wraps whatever's left once any already-consumed
  // checkpoint's own members are excluded - without this, a pipeline with
  // both an earlier, already-composed-on checkpoint and a later, still-
  // pending one would double-wrap the earlier one's inner tables. Chained
  // checkpoints are still an edge case this doesn't fully model (see the
  // plan doc's still-out-of-scope list), but this avoids the most visible
  // glitch cheaply.
  const claimed = new Set(frames.flatMap(f => f.memberIds));
  const pendingMemberIds = laidOut.filter(n => n.type === 'table-node' && !claimed.has(n.id)).map(n => n.id);
  const pendingFrame = hasPendingCheckpoint
    ? makeFrameNode(PENDING_CHECKPOINT_FRAME_ID, laidOut, pendingMemberIds)
    : null;

  const allFrames = [...consumedFrames, ...(pendingFrame ? [pendingFrame] : [])];
  return { nodes: [...allFrames, ...laidOut], edges, parsing: true, singleBlock: true };
};
