import { Edge, Node } from 'reactflow';

type BaseNode = {
  schema: string;
  table: string;
  joinOn: string;
  color?: string | null;
};

type SelectedNodeData = BaseNode & {
  type: 'selected';
  alias: string;
  order: number;
};

type SuggestedNodeData = BaseNode & {
  type: 'suggested' | 'candidate';
  pine: string;
  parent: boolean;
};

export type PineSelectedNode = Node<SelectedNodeData>;
export type PineSuggestedNode = Node<SuggestedNodeData>;
export type PineNode = PineSelectedNode | PineSuggestedNode;

export type PineEdge = Edge;
