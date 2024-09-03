import dagre from 'dagre';
import { useEffect } from 'react';
import ReactFlow, {
  ConnectionLineType,
  Controls,
  NodeTypes,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';

import { Box, BoxProps } from '@mui/material';
import { observer } from 'mobx-react-lite';
import 'reactflow/dist/style.css';
import { PineEdge, PineNode } from '../model';
import { useStores } from '../store/store-container';
import SelectedNodeComponent from './SelectedNodeComponent';
import SuggestedNodeComponent from './SuggestedNodeComponent';

const nodeWidth = 172;
const nodeHeight = 0; // 36;

export const NodeType = {
  Selected: 'selectedNode',
  Suggested: 'pineNode',
};
const nodeTypes: NodeTypes = {
  [NodeType.Suggested]: SuggestedNodeComponent,
  [NodeType.Selected]: SelectedNodeComponent,
};

const getLayoutedElements = (
  nodes: PineNode[],
  edges: PineEdge[],
  direction: 'TB' | 'LR' = 'LR',
) => {
  // should we create a new graph every single time?
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach(node => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? Position.Left : Position.Top;
    node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

    // We are shifting the dagre node position (anchor=center center) to the top left
    // so it matches the React Flow node anchor point (top left).
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };

    return node;
  });

  return { nodes, edges };
};

const Flow = observer(() => {
  const { global, graph } = useStores();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowInstance = useReactFlow();

  useEffect(() => {
    const { nodes, edges } = getLayoutedElements(graph.nodes, graph.edges);
    setNodes(nodes);
    setEdges(edges);

    // TODO: when the number of nodes change drastically, the fit view doesn't
    // work as expected. Using a setTimeout is a workaround.
    setTimeout(() => {
      reactFlowInstance.fitView({ duration: 200 });
    }, 250);

    // TODO: how can I avoid disabling the eslint rule?
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes, graph.edges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      connectionLineType={ConnectionLineType.Bezier}
      nodesConnectable={false}
      elementsSelectable={false}
      fitView
    >
      <Controls />
    </ReactFlow>
  );
});

// Define the props for the GraphBox component
interface GraphBoxProps extends BoxProps {}

const GraphBox: React.FC<GraphBoxProps> = observer(({ sx, ...props }) => {
  const { global } = useStores();
  return global.loaded ? (
    <></>
  ) : (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
});

export default GraphBox;
