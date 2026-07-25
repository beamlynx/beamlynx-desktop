import { Edge, Node } from 'reactflow';

type BaseNode = {
  sessionId: string;
  schema: string;
  table: string;
  column: string; // TODO: rename to joinOn column
  color?: string | null;
};

/** One connection point on a selected node's left/right side, keyed by its join column. */
export type NodeHandle = { id: string; column: string };

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
};

export type PineInputNode = Node<InputNodeData>;

export type PineSelectedNode = Node<SelectedNodeData>;
export type PineSuggestedNode = Node<SuggestedNodeData>;
export type PineVariableNode = Node<VariableNodeData>;
export type PineNode = PineSelectedNode | PineSuggestedNode | PineInputNode | PineVariableNode;

export type PineEdge = Edge;
