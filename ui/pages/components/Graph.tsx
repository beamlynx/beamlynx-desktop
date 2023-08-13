import dagre from 'dagre';
import { useEffect } from 'react';
import ReactFlow, { ConnectionLineType, Position, useEdgesState, useNodesState } from 'reactflow';

import { observer } from 'mobx-react-lite';
import 'reactflow/dist/style.css';
import { useStores } from '../store/store-container';
import { Metadata } from './model';
import { Box } from '@mui/material';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 172;
const nodeHeight = 36;

const getLayoutedElements = (metadata: Metadata, direction = 'TB') => {
  const { nodes, edges } = metadata;
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

const Graph = observer(() => {
  const { global: store, graph: settings, dummyGraph } = useStores();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const fetchGraph = async () => {
      await settings.getDummyGraph();
      setNodes(nodes);
      setEdges(edges);
    };
    fetchGraph().catch(e => {
      alert(`some error: ${e}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const { nodes, edges } = getLayoutedElements(settings.graph);
    setNodes(nodes);
    setEdges(edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.graph]);


  return store.loaded ? (
    <></>
  ) : (
    <Box
      height={400}
      sx={{
        m: 2,
        ml: 1,
        border: '1px solid lightgray',
        borderRadius: 1,
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
      ></ReactFlow>
    </Box>
  );
});

export default Graph;
