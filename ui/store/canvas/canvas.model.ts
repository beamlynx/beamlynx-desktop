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
  /**
   * The `unnest:` steps on this table's columns, `data as e`, and what the
   * query reads from their elements, `e.field`, shown after this table's own
   * chips. Shown only: the chip actions edit a table's own columns.
   */
  unnestChips?: string[];
  elementChips?: { select: string[]; where: string[]; order: string[]; group: string[] };
  leftHandles: CanvasHandle[];
  rightHandles: CanvasHandle[];
  /**
   * Set when this node is a checkpoint's sealed result rather than a table:
   * the node below a checkpoint's divider, named after the checkpoint
   * (`alias` and `table` are both its name, exactly as pine-lang reports
   * it). It is drawn like any table; its actions work on the sealed result -
   * see CanvasStore.openCheckpointPicker.
   *
   * `expanded`: whether the stage it seals is drawn above it (see layout.ts's
   * buildCanvasGraph - one checkpoint is expanded at a time). Its divider,
   * with the label, × and expand toggle, is a separate node above it.
   */
  checkpoint?: { expanded: boolean };
  /**
   * Set when this node stands for a nested query: a checkpoint's node, or a
   * table that uses a named result from an earlier query block (a block
   * ending in `|= name`). It shows `label` (`limit 10`, `|= top`) and an
   * expand toggle; expanded, a container above it holds what the nested
   * query holds (see layout.ts's buildCanvasGraph). `limit` makes the label
   * open the limit editor.
   */
  nested?: {
    kind: 'checkpoint' | 'named';
    name: string;
    label: string;
    limit?: number;
    expanded: boolean;
  };
};

// eslint-disable-next-line @typescript-eslint/ban-types
export type CanvasStartNodeData = {};

/**
 * An expanded nested query's container (see layout.ts's buildCanvasGraph): a
 * dashed box with no fill around what it holds, directly above its node,
 * with a short connector from its bottom edge down to the node. Its label
 * sits on its top edge. Not a pipeline slot: it isn't focusable or
 * selectable, and only its header takes clicks.
 */
export type CanvasContainerNodeData = {
  kind: 'checkpoint' | 'named';
  /** The nested query's name - what its collapse toggle collapses. */
  name: string;
  /** What it is, e.g. `limit 1 per c.id`, `group t.title with count`, `|= top`. */
  label: string;
  width: number;
  height: number;
  /** The connector's x in the box: its node's centre. */
  connectorX: number;
  /** The connector's length, from the box's bottom edge to the node's box. 0 when the box has no node. */
  connector: number;
};

/**
 * One query block in the lineage strip at the top of the canvas (see
 * layout.ts's layoutLineage): a small chip, not a table. Arrows between
 * chips say which block is made from which; joins stay in the graph below.
 */
export type CanvasLineageNodeData = {
  /** The block's `|= name`, or '' for the last block - the query the canvas draws. */
  name: string;
  /** What the block ends in, when it's a checkpoint: `limit 1 per company_id`. */
  detail?: string;
  /** Its nested query is the one expanded on the canvas. */
  expanded: boolean;
  width: number;
  height: number;
};

export type CanvasTableNode = Node<CanvasTableNodeData>;
export type CanvasStartNode = Node<CanvasStartNodeData>;
export type CanvasContainerNode = Node<CanvasContainerNodeData>;
export type CanvasLineageNode = Node<CanvasLineageNodeData>;
export type CanvasNode = CanvasTableNode | CanvasStartNode | CanvasContainerNode | CanvasLineageNode;
export type CanvasEdge = Edge & {
  unresolved?: boolean;
  uncertain?: boolean;
  /** Raw wire value from a join's `type` (client.ts) - null means inner (Pine's default, no `:left`/`:right` modifier). */
  joinType?: 'LEFT' | 'RIGHT' | null;
  /**
   * The alias whose own table segment carries the `:left`/`:right` modifier -
   * always the join's own literal `to` alias, which is NOT necessarily this
   * edge's rendered `target` (addJoins in layout.ts swaps source/target for
   * "belongs to" relations so the FK parent renders on the left, but the
   * modifier always lives on the table that was actually appended second in
   * the pipeline - see pine-actions.ts's setJoinType).
   */
  joinTargetAlias?: string;
  /**
   * Set on an arrow of the lineage strip, not a join: one block reads
   * another, as a table or after `in` (see lineage.ts).
   */
  derivation?: 'table' | 'in';
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

/**
 * One condition in the where panel. `alias` is per condition, not per panel:
 * a hand-typed `where: c.name = 'x' or e.name = 'x'` spans two tables, and
 * editing it from either chip must write both back as they were.
 */
export type WhereConditionDraft = { alias: string; column: string; operator: string; value: string };

/** What the where panel is building: one condition, or several joined with `or`. */
export type WhereDraft = {
  conditions: WhereConditionDraft[];
  /** Set only when reopened from an existing chip (ChipRow's onSelect) - see CanvasStore.openWhereEditor/submitWhereValue. Undefined for a brand-new condition. */
  editIndex?: number;
  /**
   * The first condition's `operator` doubles as the relative-date picks -
   * 'today' and 'in the last' are two extra entries Picker.tsx appends to
   * the operator <select> for a brand-new, single condition on a column
   * that looksLikeDateColumn (never while editing an existing one, and never
   * alongside an `or` - see CanvasStore.submitWhereValue's own comment),
   * rather than a separate mode/tab. `value` is unused for both;
   * `rollingCount`/`rollingUnit` are unused except for 'in the last'.
   * Always reset to '=' when the panel (re)opens - a stored condition has no
   * record of having been built from one of these, so there's nothing to
   * restore.
   */
  rollingCount: number;
  rollingUnit: RelativeDateUnit;
};

export type PickerRequest =
  | { kind: 'table' }
  | { kind: 'join'; alias: string }
  | { kind: 'select'; alias: string }
  /**
   * `draft` is set when the list was opened from the where panel's own `or`
   * button: the conditions entered so far, kept so that picking a column
   * returns to the panel with that column appended as a new row, instead of
   * starting over. See CanvasStore.addWhereOrCondition.
   */
  | { kind: 'where'; alias: string; draft?: WhereDraft }
  | { kind: 'order'; alias: string }
  | { kind: 'group'; alias: string }
  // The JSON columns of `alias` an `unnest:` can read.
  | { kind: 'unnest'; alias: string }
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
      /** The node the panel was opened from, and so the node its chip belongs to. */
      alias: string;
      anchor: PickerAnchor;
    } & WhereDraft
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
      /** Which overflow actions to offer - group is never offered on a checkpoint's node. */
      offer: MoreAction[];
      /** Whether `alias` names a checkpoint's node rather than a plain table - decides routing (openCheckpointPicker vs the direct open*Picker methods). */
      isCheckpoint: boolean;
      anchor: PickerAnchor;
    }
  | {
      open: true;
      mode: 'limit-value';
      /** The node the gesture was opened from. The limit changed is the one ending this node's stage (see pine-actions.ts's setLimit). */
      alias: string;
      /** Set when opened from a checkpoint's divider label: the limit changed is that checkpoint's own. */
      checkpoint?: string;
      /** The pipeline's existing limit, if any - null shows no "clear" action (see Picker.tsx). Unlike `value` below, never changed after the picker opens. */
      current: number | null;
      /** The input's live text, seeded from `current` (CanvasStore.openLimitEditor) - a string, not a number, so a mid-edit empty/partial value doesn't need its own placeholder state. */
      value: string;
      /** The columns after `per`, as written (`c.id`): the first N rows of each group of rows sharing them. Empty: a plain limit. */
      per: string[];
      /** Columns `per` can take - every column of the stage's tables, as `alias.column`. null while loading. */
      perOptions: string[] | null;
      /** The text typed to filter `perOptions`. */
      perFilter: string;
      anchor: PickerAnchor;
    }
  | {
      open: true;
      mode: 'traverse';
      alias: string;
      /**
       * Why "Delete rows..." can't be picked, when it can't. Counting is
       * always available; deleting is only correct on a downward pipe whose
       * last table is the current one (canDeleteTraverse in
       * store/canvas/traversal.ts). Carried as a reason rather than a bare
       * boolean so the entry can be shown disabled *with* its explanation -
       * a missing menu item is a mystery, a disabled one with a sentence
       * teaches the rule.
       */
      deleteBlockedReason: string | null;
      anchor: PickerAnchor;
    };

/** The actions tucked behind a node's "+" overflow trigger - see TableNode.tsx. */
export type MoreAction = 'order' | 'group' | 'path' | 'limit' | 'traverse' | 'unnest';
export const MORE_ACTIONS: { action: MoreAction; label: string; key: string }[] = [
  { action: 'order', label: 'order', key: 'o' },
  { action: 'group', label: 'group', key: 'g' },
  { action: 'limit', label: 'limit', key: 'l' },
  { action: 'path', label: 'path', key: 'p' },
  { action: 'traverse', label: 'traverse', key: 't' },
  { action: 'unnest', label: 'unnest', key: 'u' },
];

/**
 * What the "+" menu offers, by node kind. Defined once because it is read from
 * several places - TableNode's button for a table and for a checkpoint, and
 * the keyboard shortcut in useCanvasKeybindings - and hand-maintained copies drift:
 * `traverse` was added to the button's list and the keyboard opened a menu
 * without it.
 *
 * A checkpoint's node gets less: `group` would re-group an already-grouped
 * result, and `traverse` would have to follow a foreign key out of a CTE's
 * sealed output, which is not a thing.
 */
// `unnest` is only offered on a table with a JSON column: see
// CanvasStore.openMorePicker.
export const MORE_ACTIONS_FOR_TABLE: MoreAction[] = ['order', 'group', 'limit', 'path', 'traverse', 'unnest'];
// `limit` on a checkpoint's node limits its sealed result.
export const MORE_ACTIONS_FOR_CHECKPOINT: MoreAction[] = ['order', 'limit', 'path'];

/** What a traversal does at each table it reaches - see store/canvas/traversal.ts. */
export const TRAVERSE_VERBS: { verb: 'count' | 'delete'; label: string; key: string }[] = [
  { verb: 'count', label: 'Count rows', key: 'c' },
  // The ellipsis is doing real work: this produces the queries and stops.
  // Running them is a separate decision, made in the panel afterwards.
  { verb: 'delete', label: 'Delete rows…', key: 'd' },
];

// `in`/`not in` take a list (`1, 2` or `(1, 2)`) or a list variable (`$ids`).
export const WHERE_OPERATORS = ['=', '!=', '>', '<', 'like', 'not like', 'ilike', 'is', 'is not', 'in', 'not in'] as const;

export const RELATIVE_DATE_UNITS = [
  { value: 'day', label: 'day' },
  { value: 'week', label: 'week' },
  { value: 'month', label: 'month' },
  { value: 'year', label: 'year' },
] as const;
export type RelativeDateUnit = (typeof RELATIVE_DATE_UNITS)[number]['value'];

/**
 * The two extra entries Picker.tsx appends to the where-value operator
 * <select> for a date-shaped column (see PickerState's `mode: 'where-value'`
 * doc) - picking either drives CanvasStore.submitWhereValue down the
 * relative-date path instead of a plain comparison. Named string constants
 * rather than inline literals so the option's `value`, the store's dispatch
 * check, and computeDateBounds's caller all read the same source.
 */
export const WHERE_TODAY_OPERATOR = 'today';
export const WHERE_ROLLING_OPERATOR = 'in the last';

/** What `computeDateBounds` (relative-date.ts) turns into a `>`/`<` literal pair. */
export type RelativeDateSelection = { kind: 'today' } | { kind: 'rolling'; count: number; unit: RelativeDateUnit };
