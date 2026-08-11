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
  leftHandles: CanvasHandle[];
  rightHandles: CanvasHandle[];
};

// eslint-disable-next-line @typescript-eslint/ban-types
export type CanvasStartNodeData = {};

export type CanvasTableNode = Node<CanvasTableNodeData>;
export type CanvasStartNode = Node<CanvasStartNodeData>;
export type CanvasNode = CanvasTableNode | CanvasStartNode;
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
  /** hint.pine for table/join items; bare column name for select/where/order items. */
  value: string;
};

export type PickerRequest =
  | { kind: 'table' }
  | { kind: 'join'; alias: string }
  | { kind: 'select'; alias: string }
  | { kind: 'where'; alias: string }
  | { kind: 'order'; alias: string };

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
