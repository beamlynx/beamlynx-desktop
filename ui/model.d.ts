import { Edge, Node } from 'reactflow';
import { TableHint } from './store/client';

type BaseNode = {
  sessionId: string;
  // null on a suggested node identifies a variable/checkpoint reference
  // rather than a real table (see TableHint in client.ts).
  schema: string | null;
  table: string;
  // undefined on a suggested node with no context at all (the first table
  // typed, with no relation to describe yet) - see TableHint in client.ts.
  column?: string; // TODO: rename to joinOn column
  color?: string | null;
};

/**
 * One connection point on a selected node's left/right side, keyed by its
 * join column. `connectedNodeId` is the id of the node on the other end of
 * the relation — used to order handles by that node's actual rendered
 * position once layout is known (see getLayoutedElements).
 */
export type NodeHandle = { id: string; column: string; connectedNodeId: string };

export type SelectedNodeData = BaseNode & {
  type: 'selected';
  alias: string;
  order: number;
  columns: string[];
  orderColumns: string[];
  whereColumns: string[];
  // Current node
  suggestedColumns: string[];
  suggestedOrderColumns: string[];
  suggestedWhereColumns: string[];
  // One handle per distinct FK relation touching this node (left = this node is
  // the child/target, right = this node is the parent/source).
  leftHandles: NodeHandle[];
  rightHandles: NodeHandle[];
};

export type SuggestedNodeData = BaseNode & {
  type: 'suggested' | 'candidate';
  pine: string;
  // Both undefined together on a no-context hint (the first table typed) -
  // there's no relation direction to describe yet.
  parent?: boolean;
  resolution?: TableHint['resolution'];
  // The already-selected context node's own join column - the other end of
  // the edge this suggestion would create (see TableHint['related-column']).
  relatedColumn?: string;
};

export type InputNodeData = {
  sessionId: string;
  type: 'input';
  alias: string; // For the input node, this works as the id
  operation: OperationType;
  expression: string;
  isFocused?: boolean;
};

export type VariableInnerTable = {
  table: string;
  schema: string;
  alias: string;
  color: string;
};

export type VariableNodeData = {
  type: 'variable';
  variableName: string;
  sessionId: string;
  innerTables: VariableInnerTable[];
  // Its position among selected-tables, same as SelectedNodeData.order — a
  // container replaces one of those entries rather than adding a new one, so
  // it takes over that entry's position number.
  order: number;
  // Same per-relation handle treatment as SelectedNodeData — a checkpoint
  // container replaces a real table in the pipeline, so joins/hints connect
  // to it the same way and it needs the same handles.
  leftHandles: NodeHandle[];
  rightHandles: NodeHandle[];
};

export type PineInputNode = Node<InputNodeData>;

export type PineSelectedNode = Node<SelectedNodeData>;
export type PineSuggestedNode = Node<SuggestedNodeData>;
export type PineVariableNode = Node<VariableNodeData>;
export type PineNode = PineSelectedNode | PineSuggestedNode | PineInputNode | PineVariableNode;

export type PineEdge = Edge;
