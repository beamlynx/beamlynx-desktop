import { Edge, Node } from 'reactflow';

// Canvas mode's own node/edge/picker types - deliberately not sharing
// model.d.ts's PineNode/SelectedNodeData family (see the plan doc's file
// list). The old graph's suggested/candidate machinery has no equivalent
// here: this mode replaces "suggested nodes" with pickers opened from a
// node's action bar.

export type CanvasHandle = { id: string; column: string; connectedNodeId: string };

export type CanvasTableNodeData = {
  alias: string;
  table: string;
  schema: string | null;
  color?: string | null;
  order: number;
  isCurrent: boolean;
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
export type CanvasFrameNodeData = { width: number; height: number; leftHandles: CanvasHandle[]; rightHandles: CanvasHandle[] };

export type CanvasTableNode = Node<CanvasTableNodeData>;
export type CanvasStartNode = Node<CanvasStartNodeData>;
export type CanvasFrameNode = Node<CanvasFrameNodeData>;
export type CanvasNode = CanvasTableNode | CanvasStartNode | CanvasFrameNode;
export type CanvasEdge = Edge & { unresolved?: boolean; uncertain?: boolean };

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
};

export type PickerRequest =
  | { kind: 'table' }
  | { kind: 'join'; alias: string }
  | { kind: 'select'; alias: string }
  | { kind: 'where'; alias: string }
  | { kind: 'order'; alias: string }
  | { kind: 'group'; alias: string };

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
    }
  | {
      open: true;
      mode: 'where-value';
      alias: string;
      column: string;
      operator: string;
      value: string;
      anchor: PickerAnchor;
    };

export const WHERE_OPERATORS = ['=', '!=', '>', '<', 'like', 'not like', 'ilike', 'is', 'is not'] as const;
