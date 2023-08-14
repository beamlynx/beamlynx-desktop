import { Edge, Node } from 'reactflow';

export type PineNode = Node<{
  label: string;
}>;
export type PineEdge = Edge;

export type Metadata = {
  'db/references': {
    table: {
      [table: string]: {
        'refers-to': {
          [foreignTable: string]: {
            via: {
              [col: string]: string[]; // [s, t, c, := , s, t, c]
            };
          };
        };
      };
    };
  };
};
