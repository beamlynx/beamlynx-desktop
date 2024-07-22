import { Edge, Node } from 'reactflow';

type BaseNode = {
  schema: string;
  table: string;
  joinOn: string;
  color?: string | null;
};

type SelectedNode = BaseNode & {
  type: 'selected';
  alias: string;
  order: number;
};

type SuggestedNode = BaseNode & {
  type: 'suggested' | 'candidate';
  pine: string;
  parent: boolean;
};

export type PineNodeData = SelectedNode | SuggestedNode;

export type PineSelectedNode = Node<SelectedNode>
export type PineSuggestedNode = Node<SuggestedNode>;
export type PineNode = PineSelectedNode | PineSuggestedNode;

export type PineEdge = Edge;

/**
 * @deprecated
 */
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
