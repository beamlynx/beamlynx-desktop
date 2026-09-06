import { Edge, Node } from 'reactflow';

// Canvas mode's own node/edge/picker types - deliberately not sharing
// model.d.ts's PineNode/SelectedNodeData family (see the plan doc's file
// list). The old graph's suggested/candidate machinery has no equivalent
// here: this mode replaces "suggested nodes" with pickers opened from a
// node's action bar.

/**
 * Stable id for the empty-graph "+ pick a table" node - shared between
 * Canvas.tsx (which renders it in place of `canvasGraph.nodes` when that's
 * empty) and CanvasStore's keyboard-focus tracking (which needs the same id
 * to treat it as a focus target). Lives here rather than in Canvas.tsx so
 * the store doesn't have to import a component file.
 */
export const START_NODE_ID = '__canvas_start__';

/**
 * Render id for the trailing group:/limit: checkpoint's frame while it's
 * still the pipeline's tail (layout.ts's makeFrameNode/buildCanvasGraph) -
 * distinct from a *consumed* checkpoint's frame, whose id is its own real
 * pinned name. This placeholder can outlive pinning itself: eager
 * background pinning (CanvasStore.ensureCheckpointPinnedShared) often gives
 * the checkpoint a real name well before anything is built on top of it, so
 * "pending" here means "still the tail", not "still unnamed". Any code
 * comparing this id against something keyed by the checkpoint's real
 * alias - CanvasStore.picker's `request.alias` in particular - must resolve
 * through CanvasStore.resolveFrameAlias first, or the comparison silently
 * never matches (confirmed live: the frame's insert-mode decluttering never
 * engaged, because its own placeholder id never equals the real pinned name
 * `openCheckpointPicker` opens the picker under).
 */
export const PENDING_CHECKPOINT_FRAME_ID = '__checkpoint_frame__';

export type CanvasHandle = { id: string; column: string; connectedNodeId: string };

export type CanvasTableNodeData = {
  alias: string;
  table: string;
  schema: string | null;
  color?: string | null;
  order: number;
  removable: boolean;
  selectColumns: string[];
  whereChips: string[]; // display text, e.g. "id = 1"
  orderChips: string[]; // display text, e.g. "name desc"
  groupChips: string[]; // this alias's own contribution to the one shared group: segment
  leftHandles: CanvasHandle[];
  rightHandles: CanvasHandle[];
};

// eslint-disable-next-line @typescript-eslint/ban-types
export type CanvasStartNodeData = {};

/**
 * Background decoration for a pipeline that currently ends in an unconsumed
 * group:/limit: checkpoint, or for a checkpoint that HAS been composed on
 * top of, whose inner tables render as their own normal table nodes rather
 * than a collapsed summary (an earlier design that collapsed them was
 * explicitly rejected - see the plan doc's container-node follow-up pass) -
 * drawn behind whichever nodes it wraps (see layout.ts's makeFrameNode), not
 * a replacement for them. `width`/`height` are precomputed from those
 * nodes' laid-out positions, since a plain node has no way to size itself
 * from its siblings. Border plus an action bar operating on the
 * checkpoint's sealed output once pinned - see CanvasStore.
 * ensureCheckpointPinned/openCheckpointPicker.
 *
 * `leftHandles`/`rightHandles` are only non-empty for a *named* checkpoint
 * that something has actually joined onto or from - the frame's node id is
 * the checkpoint's own pinned name in that case (see layout.ts's
 * deriveGraph/makeFrameNode), which is exactly the alias `ast.joins`
 * already addresses it by, so a join onto the sealed output attaches to
 * the frame itself rather than dangling with nowhere to render.
 */
export type CanvasFrameNodeData = {
  width: number;
  height: number;
  leftHandles: CanvasHandle[];
  rightHandles: CanvasHandle[];
  /**
   * The highest `data.order` among this frame's own member tables - lets
   * CanvasStore.orderedFocusTargets slot the frame into the same single
   * keyboard-navigable sequence as table nodes, immediately after the last
   * table it wraps (see that getter's `memberOrder + 0.5` sort key).
   */
  memberOrder: number;
};

export type CanvasTableNode = Node<CanvasTableNodeData>;
export type CanvasStartNode = Node<CanvasStartNodeData>;
export type CanvasFrameNode = Node<CanvasFrameNodeData>;
export type CanvasNode = CanvasTableNode | CanvasStartNode | CanvasFrameNode;
export type CanvasEdge = Edge & {
  unresolved?: boolean;
  uncertain?: boolean;
  /** Raw wire value from JoinTuple[3] (client.ts) - null means inner (Pine's default, no `:left`/`:right` modifier). */
  joinType?: 'LEFT' | 'RIGHT' | null;
  /**
   * The alias whose own table segment carries the `:left`/`:right` modifier -
   * always JoinTuple's literal `to-alias`, which is NOT necessarily this
   * edge's rendered `target` (addJoins in layout.ts swaps source/target for
   * "belongs to" relations so the FK parent renders on the left, but the
   * modifier always lives on the table that was actually appended second in
   * the pipeline - see pine-actions.ts's setJoinType).
   */
  joinTargetAlias?: string;
};

export type CanvasGraph = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  /** false once the expression stops parsing - see the plan doc's degrade behavior. */
  parsing: boolean;
  /** false when the session currently holds more than one blank-line-separated block - out of scope for phase 1. */
  singleBlock: boolean;
};

// --- pickers -------------------------------------------------------------

export type PickerItem = {
  id: string;
  label: string;
  detail?: string;
  group?: string;
  /** hint.pine for table/join items; bare column name for select/where/order/group items. */
  value: string;
  /**
   * Set only when this join candidate's table is otherwise indistinguishable
   * from another candidate in the same group (same schema+table, reached via
   * a different FK column) -- see openJoinPicker's toItems. Unset for every
   * ordinary, unambiguous candidate, so the common case renders exactly as
   * before this field existed.
   */
  columnHint?: string;
  /**
   * Set only for a path-route item (openPathRoutePicker) whose destination
   * table is reachable more than one way - e.g. "via employee" - so two
   * routes to the identical table (same label/detail) read as distinguishable
   * rows. Unlike columnHint, this isn't a Pine `.column` fragment, so it
   * renders as plain text rather than a dot-prefixed one.
   */
  subLabel?: string;
};

export type PickerRequest =
  | { kind: 'table' }
  | { kind: 'join'; alias: string }
  | { kind: 'select'; alias: string }
  | { kind: 'where'; alias: string }
  | { kind: 'order'; alias: string }
  | { kind: 'group'; alias: string }
  /** Step 1 of `? table` (docs/paths.md in pine-lang): pick a destination table - see CanvasStore.openPathPicker. */
  | { kind: 'path'; alias: string }
  /** Step 2: pick one of the discovered routes to `target` - see CanvasStore.openPathRoutePicker. */
  | { kind: 'path-route'; alias: string; target: string; targetSchema?: string };

/** Inner is Pine's default (no table modifier) - see pine-actions.ts's setJoinType/JOIN_MODIFIER_RE. */
export type JoinType = 'inner' | 'left' | 'right';
export const JOIN_TYPES: { type: JoinType; label: string; key: string }[] = [
  { type: 'inner', label: 'Inner', key: 'i' },
  { type: 'left', label: 'Left', key: 'l' },
  { type: 'right', label: 'Right', key: 'r' },
];

export type OrderDirection = 'asc' | 'desc';
export const ORDER_DIRECTIONS: { direction: OrderDirection; label: string; key: string }[] = [
  { direction: 'asc', label: 'Asc', key: 'a' },
  { direction: 'desc', label: 'Desc', key: 'd' },
];

/**
 * One reconfigurable item on a focused table node - what CanvasStore's
 * Left/Right config cursor (configNext/configPrev) moves between, in the
 * same order TableNode.tsx's own action bar lists these five operations.
 * `join-type` has no identity beyond its kind (a node has at most one
 * incoming join). `select`/`order`/`group` identify by the column's own
 * VALUE, not its array position - unlike `where` (whose conditions have no
 * unique value to key on, since two conditions can name the same column),
 * these three pickers deliberately stay open across repeat toggles
 * (toggleSelectColumn et al never call closePicker), so a plain index
 * captured before a toggle can point at a completely different column once
 * the array shrinks out from under it (confirmed live: removing a select
 * chip while it was config-cursor-highlighted moved the highlight to
 * whatever other already-selected column happened to slide into that same
 * numeric slot). Tracking by value instead means CanvasStore.
 * focusedConfigItem naturally reports "nothing" once the exact item is
 * gone, rather than silently reinterpreting a stale index as a different
 * item still being highlighted.
 */
export type ConfigItem =
  | { kind: 'select'; column: string }
  | { kind: 'join-type' }
  | { kind: 'where'; index: number }
  | { kind: 'order'; column: string }
  | { kind: 'group'; column: string };

/** Viewport coordinates (clientX/clientY) of the action button that opened the picker - see Picker.tsx. */
export type PickerAnchor = { x: number; y: number };

export type PickerState =
  | { open: false }
  | {
      open: true;
      mode: 'list';
      request: PickerRequest;
      anchor: PickerAnchor;
      loading: boolean;
      groups: { label: string; items: PickerItem[] }[];
      filter: string;
      error?: string;
      /**
       * Pre-highlight this item (matched against PickerItem.value) once the
       * list loads, instead of defaulting to the top row - set only when
       * reopened from a specific already-selected chip (CanvasStore.
       * openConfigCursor's select/order/group branch), so pressing Enter
       * immediately toggles the SAME column back off (removes it) rather
       * than landing on whatever's first in the list and adding a different
       * one. Undefined for the action bar's own "select"/"order"/"group"
       * button, which has no one chip to return to.
       */
      focusValue?: string;
    }
  | {
      open: true;
      mode: 'where-value';
      alias: string;
      column: string;
      operator: string;
      value: string;
      anchor: PickerAnchor;
      /** Set only when reopened from an existing chip (ChipRow's onSelect) - see CanvasStore.openWhereEditor/submitWhereValue. Undefined for a brand-new condition. */
      editIndex?: number;
    }
  | {
      open: true;
      mode: 'join-type';
      alias: string;
      current: JoinType;
      anchor: PickerAnchor;
    }
  | {
      open: true;
      mode: 'order-direction';
      alias: string;
      column: string;
      /** Same pipeline-order indexing as removeOrderColumnAt/setOrderDirectionAt. */
      index: number;
      current: OrderDirection;
      anchor: PickerAnchor;
    }
  | {
      open: true;
      mode: 'more';
      alias: string;
      /** Which overflow actions to offer - group is never offered on a checkpoint frame (see FrameNode.tsx). */
      offer: MoreAction[];
      /** Whether `alias` names a checkpoint frame rather than a plain table - decides join-type routing (openCheckpointPicker vs the direct open*Picker methods). */
      isFrame: boolean;
      anchor: PickerAnchor;
    };

/** The actions tucked behind a node's "+" overflow trigger - see TableNode.tsx/FrameNode.tsx. */
export type MoreAction = 'order' | 'group' | 'path';
export const MORE_ACTIONS: { action: MoreAction; label: string; key: string }[] = [
  { action: 'order', label: 'order', key: 'o' },
  { action: 'group', label: 'group', key: 'g' },
  { action: 'path', label: 'path', key: 'p' },
];

export const WHERE_OPERATORS = ['=', '!=', '>', '<', 'like', 'not like', 'ilike', 'is', 'is not'] as const;
