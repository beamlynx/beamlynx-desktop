import { Edge, Node } from "reactflow";

export type PineNode = Node<{
  label: string;
}>;
export type PineEdge = Edge;


export type Metadata = {
  nodes: PineNode[];
  edges: PineEdge[];
};
