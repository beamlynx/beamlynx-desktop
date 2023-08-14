import dagre from 'dagre';
import { useEffect } from 'react';
import ReactFlow, {
  ConnectionLineType,
  Controls,
  Position,
  ReactFlowInstance,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';

import { Box } from '@mui/material';
import { observer } from 'mobx-react-lite';
import 'reactflow/dist/style.css';
import { useStores } from '../../store/store-container';
import { PineEdge, PineNode } from '../../model';

const nodeWidth = 172;
const nodeHeight = 0; // 36;

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
  const { graph } = useStores();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowInstance = useReactFlow();

  useEffect(() => {
    const { nodes, edges } = getLayoutedElements(graph.nodes, graph.edges);
    setNodes(nodes);
    setEdges(edges);
    reactFlowInstance.fitView();
    // TODO: how can I avoid disabling the eslint rule?
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes, graph.edges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
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

const GraphBox = observer(() => {
  const { global } = useStores();
  return global.loaded ? (
    <></>
  ) : (
    <Box
      height={600}
      sx={{
        m: 2,
        ml: 1,
        border: '1px solid lightgray',
        borderRadius: 1,
      }}
    >
      <ReactFlowProvider>
        <Flow />
      </ReactFlowProvider>
    </Box>
  );
});

export default GraphBox;
