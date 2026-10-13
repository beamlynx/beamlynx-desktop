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
  CanvasContainerNode,
  CanvasEdge,
  CanvasGraph,
  CanvasHandle,
  CanvasLineageNode,
  CanvasNode,
  CanvasTableNode,
  CanvasTableNodeData,
} from './canvas.model';
import { Lineage, LINEAGE_MAIN } from './lineage';
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

/**
 * The where conditions of `alias` in every stage, in pipeline order - the
 * same order its chips show them. A table sealed by a checkpoint has its
 * conditions in the checkpoint's snapshot, not the top-level `ast.where`.
 */
export const whereEntriesFor = (ast: Ast, alias: string): WhereEntry[] =>
  stagesOf(ast)
    .filter((stage, k, all) => all.findIndex(s => s.source === stage.source) === k)
    .flatMap(s => s.source.where)
    .filter(w => whereConditions(w)[0].alias === alias);

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
        // Whether it's expanded is set by buildCanvasGraph.
        checkpoint: { expanded: false },
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

// An expanded nested query's container: a dashed box, with no fill, around
// what the nested query holds, directly above its node. `containerPad` is
// the room inside the border, `containerHeader` the room for the label on
// its top edge, and `connectorGap` the space between the box and the node's
// action bar, which the connector crosses to reach the node's box.
const containerPad = 14;
const containerHeader = 16;
const connectorGap = 10;

/**
 * The checkpoint a gesture just added: the one in `after` that wasn't in
 * `before`, by name. A gesture always starts from a base where every
 * checkpoint is pinned (see getPinnedBase), so the earlier ones keep their
 * names and only the new one is unknown. null when none was added.
 */
export const newCheckpointName = (
  before: Checkpoint[] | undefined,
  after: Checkpoint[] | undefined,
): string | null => {
  const known = new Set((before ?? []).map(c => c.name));
  const added = (after ?? []).filter(c => !known.has(c.name));
  return added.length === 1 && (after ?? []).length > (before ?? []).length ? added[0].name : null;
};

/**
 * An earlier query block of the tab that ends in `|= name`: a nested query of
 * the last block. `prefix` (`b0/`) goes in front of every node id drawn
 * from it, so its aliases can't clash with the last block's, and so a
 * gesture on one of its nodes knows which block's text to edit (see
 * CanvasStore.scopeOf). `ast` is the block's own build.
 */
export type NamedBlock = { name: string; prefix: string; ast: Ast };

/**
 * What is expanded, worked out from CanvasStore.expandedNested (one name, or
 * undefined or null for none - the default):
 *
 * - `block`: the named block drawn above the last block, if any. Naming a
 *   block, or a checkpoint inside one (`b0/result_1`), expands it.
 * - `innerOpen`: the checkpoint expanded inside that block (unprefixed), or
 *   null: only the block's last stage is drawn.
 * - `mainOpen`: the index of the last block's expanded checkpoint, or -1.
 *   While a block is expanded, it is the checkpoint whose stage holds the
 *   node that uses the block, so that node stays drawn.
 */
export type Expansion = { block: NamedBlock | null; innerOpen: string | null; mainOpen: number };

/**
 * The stage of `ast` whose tables include the named result `name`, or null
 * when nothing in the query joins it.
 */
const stageUsing = (ast: Ast, name: string): number | null => {
  const names = new Set((ast.checkpoints ?? []).map(c => c.name));
  const k = stagesOf(ast).findIndex(s => s.source.tables.some(t => t.table === name && !names.has(t.table)));
  return k < 0 ? null : k;
};

export const expansionOf = (ast: Ast, blocks: NamedBlock[], expanded: string | null | undefined): Expansion => {
  const checkpoints = ast.checkpoints ?? [];
  const block =
    typeof expanded === 'string'
      ? (blocks.find(b => b.name === expanded || expanded.startsWith(b.prefix)) ?? null)
      : null;
  if (block) {
    const inner = expanded!.startsWith(block.prefix) ? expanded!.slice(block.prefix.length) : null;
    const used = stageUsing(ast, block.name);
    return {
      block,
      innerOpen: inner && (block.ast.checkpoints ?? []).some(c => c.name === inner) ? inner : null,
      mainOpen: used !== null && used < checkpoints.length ? used : -1,
    };
  }
  // By default nothing is expanded, and a name this ast doesn't have
  // (removed, or not built yet) means nothing either.
  const open = typeof expanded === 'string' ? checkpoints.findIndex(c => c.name === expanded) : -1;
  return { block: null, innerOpen: null, mainOpen: open };
};

/**
 * A container to draw: an expanded nested query's box. `members` are the ids
 * of the nodes it holds, and `inner` the name of a container nested in it
 * (an expanded checkpoint further up the chain).
 */
type ContainerSpec = {
  kind: 'checkpoint' | 'named';
  name: string;
  label: string;
  /**
   * The node below the box: the nested query's own node. A named block the
   * last query doesn't join has none; its box has no connector.
   */
  nodeId?: string;
  members: string[];
  inner?: string;
};

const prefixed = (prefix: string, nodes: CanvasTableNode[], edges: CanvasEdge[]) => {
  if (!prefix) return { nodes, edges };
  const p = (id: string) => prefix + id;
  const handles = (hs: CanvasHandle[]) => hs.map(h => ({ ...h, connectedNodeId: p(h.connectedNodeId) }));
  return {
    nodes: nodes.map(n => ({
      ...n,
      id: p(n.id),
      data: { ...n.data, alias: p(n.data.alias), leftHandles: handles(n.data.leftHandles), rightHandles: handles(n.data.rightHandles) },
    })),
    edges: edges.map(e => ({
      ...e,
      id: p(e.id),
      source: p(e.source),
      target: p(e.target),
      joinTargetAlias: e.joinTargetAlias === undefined ? undefined : p(e.joinTargetAlias),
    })),
  };
};

/**
 * Lays out one query block's stages from `top` down (see stagesOf),
 * starting at `firstStage`. `openIndex` is its expanded checkpoint (-1:
 * none): checkpoints from it down are expanded, and each gets a container
 * around the stage it seals. `dropLastStage` leaves out a trailing
 * checkpoint's node-only stage - a named block ending in `limit: 10 |= x`,
 * whose node is the last block's `x`; `sealing` is then what that node's
 * container holds.
 */
const layoutPipeline = (
  ast: Ast,
  prefix: string,
  firstStage: number,
  openIndex: number,
  top: number,
  order: number,
  dropLastStage = false,
) => {
  const checkpoints = ast.checkpoints ?? [];
  const checkpointNames = new Set(checkpoints.map(c => c.name));
  const stages = stagesOf(ast);
  const isExpanded = (name: string) => {
    const k = checkpoints.findIndex(c => c.name === name);
    return openIndex >= 0 && k >= openIndex;
  };
  const nodes: CanvasTableNode[] = [];
  const edges: CanvasEdge[] = [];
  const containers: ContainerSpec[] = [];
  const lastStage = dropLastStage ? stages.length - 2 : stages.length - 1;
  // The container drawn for the stage before, which the next one nests.
  let previous: string | undefined;
  let sealing: { members: string[]; inner?: string } = { members: [] };
  stages.forEach((stage, k) => {
    if (k < firstStage || k > lastStage) return;
    const derived = deriveStage(stage, checkpointNames, order);
    order += derived.nodes.length;
    const placed = layoutStage(derived.nodes, derived.edges).map(n => {
      const position = { x: n.position.x, y: n.position.y + top };
      if (!n.data.checkpoint) return { ...n, position };
      const checkpoint = checkpoints.find(c => c.name === n.id)!;
      const expanded = isExpanded(n.id);
      return {
        ...n,
        position,
        data: {
          ...n.data,
          checkpoint: { expanded },
          nested: {
            kind: 'checkpoint' as const,
            name: prefix + n.id,
            label: checkpointLabel(checkpoint),
            limit: checkpoint.kind === 'limit' ? checkpoint.limit : undefined,
            expanded,
          },
        },
      };
    });
    const bottom = placed.length ? Math.max(...placed.map(n => n.position.y + getNodeFootprintHeight(n))) : top;
    const { nodes: ns, edges: es } = prefixed(prefix, placed, derived.edges);
    nodes.push(...ns);
    edges.push(...es);
    const members = ns.map(n => n.id);
    if (k < checkpoints.length && k < lastStage) {
      // An expanded checkpoint's stage: a container around it, above the
      // checkpoint's node in the next stage.
      const name = prefix + checkpoints[k].name;
      containers.push({
        kind: 'checkpoint',
        name,
        label: checkpointLabel(checkpoints[k]),
        nodeId: name,
        members,
        inner: previous,
      });
      previous = name;
      top = bottom + containerPad + connectorGap;
    } else {
      sealing = { members, inner: previous };
      top = bottom;
    }
  });
  return { nodes, edges, containers, sealing, bottom: top, order };
};

// The lineage strip: one chip per query block, laid out left to right in
// the order the blocks are made, above everything else.
const lineageChipHeight = 26;
const lineageDetailHeight = 14;
const lineageGap = 36;
export const lineageId = (name: string) => `lineage:${name || 'query'}`;

/**
 * The lineage strip's chips and arrows, at the top left from y = 0, and the
 * strip's height. Nothing when the tab has a single query block: there is no
 * derivation to show. A chip is as wide as its text.
 */
const layoutLineage = (
  lineage: Lineage,
  details: Record<string, string | undefined>,
  expandedBlock: string | null,
  positions: Record<string, { x: number; y: number }>,
): { nodes: CanvasLineageNode[]; edges: CanvasEdge[]; height: number } => {
  if (lineage.names.length === 0) return { nodes: [], edges: [], height: 0 };
  const names = [...lineage.names, LINEAGE_MAIN];
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 10, ranksep: 40, marginx: 0, marginy: 0 });
  const size = (name: string) => {
    const text = name ? `|= ${name}` : 'query';
    const detail = details[name];
    const chars = Math.max(text.length, detail ? detail.length * 0.85 : 0);
    return { width: Math.max(64, Math.round(chars * 7.2) + 24), height: lineageChipHeight + (detail ? lineageDetailHeight : 0) };
  };
  names.forEach(name => g.setNode(lineageId(name), size(name)));
  lineage.edges.forEach(e => g.setEdge(lineageId(e.from), lineageId(e.to)));
  dagre.layout(g);
  const nodes: CanvasLineageNode[] = names.map(name => {
    const p = g.node(lineageId(name));
    const { width, height } = size(name);
    return {
      id: lineageId(name),
      type: 'lineage-node',
      position: { x: p.x - width / 2, y: p.y - height / 2 },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      selectable: false,
      focusable: false,
      data: { name, detail: details[name], expanded: !!name && name === expandedBlock, width, height },
    };
  });
  const minX = Math.min(...nodes.map(n => n.position.x));
  const minY = Math.min(...nodes.map(n => n.position.y));
  for (const n of nodes) n.position = { x: n.position.x - minX, y: n.position.y - minY };
  // A chip can be dragged, but only within the strip: as tall as its laid-out
  // chips, or the tallest chip if that's taller, so a chip can't land on a
  // table.
  const laidHeight = Math.max(...nodes.map(n => n.position.y + n.data.height));
  for (const n of nodes) {
    const moved = positions[n.id];
    const bottom = Math.max(laidHeight, n.data.height) - n.data.height;
    if (moved) n.position = { x: moved.x, y: Math.min(Math.max(moved.y, 0), bottom) };
    n.extent = [
      [-Infinity, 0],
      [Infinity, Math.max(laidHeight, n.data.height)],
    ];
  }
  const height = Math.max(...nodes.map(n => n.position.y + n.data.height));
  const edges: CanvasEdge[] = lineage.edges.map(e => ({
    id: `lineage:${e.from}->${e.to || 'query'}`,
    source: lineageId(e.from),
    target: lineageId(e.to),
    derivation: e.use,
  }));
  return { nodes, edges, height };
};

type Rect = { x0: number; y0: number; x1: number; y1: number };

/**
 * ast -> laid-out nodes/edges. The pipeline is drawn as stages stacked top
 * to bottom (see stagesOf). Within a stage, tables keep the left-to-right
 * layout. A checkpoint is the node named after it, drawn like any table,
 * saying what it does (`limit 10`).
 *
 * Expanding a nested query draws what it holds directly above its node, in
 * a dashed container with no fill, joined to the node by a short connector.
 * Only one is expanded at a time (see expansionOf); by default none is.
 * Checkpoints are a chain - each one's node sits in the stage the next one
 * seals - so expanding one keeps the checkpoints below it expanded too, and
 * their containers nest. The last stage is always drawn.
 *
 * `blocks` are the tab's earlier query blocks ending in `|= name`. The node
 * that uses one (a table named after it) can expand it: the block is drawn
 * above, in a container. A block the last query doesn't join has no node;
 * expanded, its container stands alone above the graph, with no connector.
 * Its chip in the strip says what is made from it.
 *
 * `lineage` says which block is made from which. It is drawn as a strip of
 * chips at the top, with arrows, apart from the join graph: an arrow there
 * means "is made from", not "joins".
 *
 * `positions` holds nodes the user has dragged: they keep that position.
 */
export const buildCanvasGraph = (
  ast: Ast,
  positions: Record<string, { x: number; y: number }>,
  expanded?: string | null,
  blocks: NamedBlock[] = [],
  lineage: Lineage = { names: [], edges: [] },
): CanvasGraph => {
  const stages = stagesOf(ast);
  const expansion = expansionOf(ast, blocks, expanded);
  const firstStage = expansion.mainOpen < 0 ? stages.length - 1 : expansion.mainOpen;

  const nodes: CanvasTableNode[] = [];
  const edges: CanvasEdge[] = [];
  const containers: ContainerSpec[] = [];
  let order = 1;

  // What each block ends in, for its chip and its node's label.
  const endingOf = (b: NamedBlock) => {
    const inner = b.ast.checkpoints ?? [];
    const last = inner[inner.length - 1];
    return last && !last.sealed && last.name === b.name ? checkpointLabel(last) : undefined;
  };
  const strip = layoutLineage(
    lineage,
    Object.fromEntries(blocks.map(b => [b.name, endingOf(b)])),
    expansion.block?.name ?? null,
    positions,
  );
  let top = strip.height ? strip.height + lineageGap : 0;

  // The expanded named block, above the last block.
  let blockLaid: ReturnType<typeof layoutPipeline> | null = null;
  if (expansion.block) {
    const b = expansion.block;
    const inner = b.ast.checkpoints ?? [];
    const last = inner[inner.length - 1];
    // `... | limit: 10 |= x`: the block's own last checkpoint is `x`, whose
    // node is the last block's x. Its node-only stage is left out; the named
    // node says what it does.
    const endsInCheckpoint = !!last && !last.sealed && last.name === b.name;
    const innerOpen = expansion.innerOpen === null ? -1 : inner.findIndex(c => c.name === expansion.innerOpen);
    const blockStages = stagesOf(b.ast).length;
    const usable = endsInCheckpoint ? blockStages - 2 : blockStages - 1;
    blockLaid = layoutPipeline(b.ast, b.prefix, innerOpen < 0 ? usable : innerOpen, innerOpen, top, order, endsInCheckpoint);
    nodes.push(...blockLaid.nodes);
    edges.push(...blockLaid.edges);
    containers.push(...blockLaid.containers);
    order = blockLaid.order;
    top = blockLaid.bottom + containerPad + connectorGap;
  }

  const main = layoutPipeline(ast, '', firstStage, expansion.mainOpen, top, order);
  nodes.push(...main.nodes);
  edges.push(...main.edges);
  containers.push(...main.containers);

  // Each node that uses a named block says so. A block the last query
  // doesn't join has no node: its chip in the strip stands for it, and its
  // container, while expanded, stands alone above the graph.
  for (const b of blocks) {
    const open = expansion.block === b;
    const ending = endingOf(b);
    const label = ending ? `${ending} |= ${b.name}` : `|= ${b.name}`;
    const using = main.nodes.find(n => n.data.table === b.name && !n.data.checkpoint);
    if (using) using.data = { ...using.data, nested: { kind: 'named', name: b.name, label, expanded: open } };
    if (open && blockLaid) {
      containers.push({ kind: 'named', name: b.name, label, nodeId: using?.id, ...blockLaid.sealing });
    }
  }

  const finalNodes = nodes.map(n => (positions[n.id] ? { ...n, position: positions[n.id] } : n));

  // Each container's box, from its members' final positions and the box of
  // the container nested in it. It also spans its node's centre, if it has
  // one, so the connector starts on its bottom edge.
  const rects: Record<string, Rect> = {};
  const rectOf = (c: ContainerSpec): Rect | null => {
    if (rects[c.name]) return rects[c.name];
    const boxes: Rect[] = finalNodes
      .filter(n => c.members.includes(n.id))
      .map(n => ({ x0: n.position.x, y0: n.position.y, x1: n.position.x + nodeWidth, y1: n.position.y + getNodeFootprintHeight(n) }));
    const innerSpec = c.inner ? containers.find(i => i.name === c.inner) : undefined;
    const inner = innerSpec ? rectOf(innerSpec) : null;
    if (inner) boxes.push(inner);
    const node = c.nodeId ? finalNodes.find(n => n.id === c.nodeId) : undefined;
    if (!boxes.length || (c.nodeId && !node)) return null;
    const centre = node ? [node.position.x + nodeWidth / 2] : [];
    const rect = {
      x0: Math.min(...boxes.map(r => r.x0), ...centre.map(x => x - 30)) - containerPad,
      y0: Math.min(...boxes.map(r => r.y0)) - containerPad - containerHeader,
      x1: Math.max(...boxes.map(r => r.x1), ...centre.map(x => x + 30)) + containerPad,
      y1: Math.max(...boxes.map(r => r.y1)) + containerPad,
    };
    rects[c.name] = rect;
    return rect;
  };

  const containerNodes: CanvasContainerNode[] = containers.flatMap(c => {
    const rect = rectOf(c);
    const node = c.nodeId ? finalNodes.find(n => n.id === c.nodeId) : undefined;
    if (!rect) return [];
    return [
      {
        id: `container:${c.name}`,
        type: 'nested-container',
        position: { x: rect.x0, y: rect.y0 },
        draggable: false,
        selectable: false,
        focusable: false,
        // Behind the nodes it holds, which stay fully interactive. ReactFlow's
        // own wrapper would otherwise take every click inside the box -
        // including the mousedown that starts a rubber-band selection. The
        // header opts back in (see NestedContainerNode.tsx).
        zIndex: -1,
        style: { pointerEvents: 'none' },
        data: {
          kind: c.kind,
          name: c.name,
          label: c.label,
          width: rect.x1 - rect.x0,
          height: rect.y1 - rect.y0,
          connectorX: node ? node.position.x + nodeWidth / 2 - rect.x0 : 0,
          // From the box's bottom edge to the node's box, past its action bar.
          connector: node ? Math.max(node.position.y + actionBarHeight - rect.y1, 0) : 0,
        },
      },
    ];
  });

  return {
    nodes: [...strip.nodes, ...containerNodes, ...finalNodes],
    edges: [...strip.edges, ...edges],
    parsing: true,
    singleBlock: true,
  };
};
