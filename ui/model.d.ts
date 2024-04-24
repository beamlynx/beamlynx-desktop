import { Edge, Node } from 'reactflow';

export type PineNodeData = {
  table: string;
  schema: string;
  alias?: string | null;
  type: 'selected' | 'suggested' | 'candidate';
  color?: string | null;
  order?: number | null;
};

export type PineNode = Node<PineNodeData>;

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
