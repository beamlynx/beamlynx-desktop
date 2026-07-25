import { Edge, Node } from 'reactflow';

type BaseNode = {
  sessionId: string;
  schema: string;
  table: string;
  column: string; // TODO: rename to joinOn column
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
  parent: boolean;
  heuristic: boolean;
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
