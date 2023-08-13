import { Edge, Node } from "reactflow";

export type PineNode = Node<{
  label: string;
}>;
export type PineEdge = Edge;


export type Graph = {
  nodes: PineNode[];
  edges: PineEdge[];
};
