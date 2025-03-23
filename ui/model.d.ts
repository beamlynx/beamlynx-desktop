import { Edge, Node } from 'reactflow';

type BaseNode = {
  sessionId: string;
  schema: string;
  table: string;
  column: string; // TODO: rename to joinOn column
  color?: string | null;
};

export type SelectedNodeData = BaseNode & {
  type: 'selected';
  alias: string;
  order: number;
  columns: string[];
  orderColumns: string[];
  // Current node
  suggestedColumns: string[];
  suggestedOrderColumns: string[];
};

export type SuggestedNodeData = BaseNode & {
  type: 'suggested' | 'candidate';
  pine: string;
  parent: boolean;
};

export type PineSelectedNode = Node<SelectedNodeData>;
export type PineSuggestedNode = Node<SuggestedNodeData>;
export type PineNode = PineSelectedNode | PineSuggestedNode;

export type PineEdge = Edge;
