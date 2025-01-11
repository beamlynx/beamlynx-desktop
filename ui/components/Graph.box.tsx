import dagre from 'dagre';
import { useEffect, useState } from 'react';
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

import { BoxProps } from '@mui/material';
import { observer } from 'mobx-react-lite';
import 'reactflow/dist/style.css';
import { PineEdge, PineNode, PineSuggestedNode } from '../model';
import { useStores } from '../store/store-container';
import SelectedNodeComponent from './SelectedNodeComponent';
import SuggestedNodeComponent from './SuggestedNodeComponent';
import { makeSuggestedNode } from '../store/graph.util';

const nodeWidth = 172;
const getNodeHeight = (node: PineNode) => {
  return node.data.type === 'selected' ? 60 : 20;
};

export const NodeType = {
  Selected: 'selectedNode',
  Suggested: 'pineNode',
};
const nodeTypes: NodeTypes = {
  [NodeType.Suggested]: SuggestedNodeComponent,
  [NodeType.Selected]: SelectedNodeComponent,
};

const getLayoutedElements = (nodes: PineNode[], edges: PineEdge[]) => {
  // should we create a new graph every single time?
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: 'LR',
  });

  nodes.forEach(node => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: getNodeHeight(node) });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = Position.Left;
    node.sourcePosition = Position.Right;

    // We are shifting the dagre node position (anchor=center center) to the top left
    // so it matches the React Flow node anchor point (top left).
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - getNodeHeight(node) / 2,
    };

    return node;
  });

  return { nodes, edges };
};

interface FlowProps {
  sessionId: string;
}

const Flow: React.FC<FlowProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
  const { graph } = session;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowInstance = useReactFlow();
  const [candidate, setCandidate] = useState<PineSuggestedNode | null>(null);

  // Render graph
  useEffect(() => {
    const n = [...graph.selectedNodes, ...graph.suggestedNodes];
    const { nodes, edges } = getLayoutedElements(n, graph.edges);
    setNodes(nodes);
    setEdges(edges);

    setTimeout(() => {
      reactFlowInstance.fitView({ duration: 200 });
    }, 250);
  }, [
    graph.selectedNodes,
    graph.suggestedNodes,
    graph.edges,
    setNodes,
    setEdges,
    reactFlowInstance,
  ]);

  // Update candidate
  useEffect(() => {
    if (!graph.candidate) {
      return;
    }
    const pine = graph.candidate.pine;

    const node = nodes.find(n => n.id === pine && n.data.type !== 'candidate');
    if (!node) {
      return;
    }

    setCandidate(node);
  }, [graph.candidate, nodes]);

  // Render candidate
  useEffect(() => {
    if (!candidate) {
      return;
    }

    setNodes(nds =>
      nds.map((n: PineSuggestedNode) => {
        const isCandidate = n.id === candidate.id;
        const node = makeSuggestedNode(n.data, isCandidate);
        const result = { ...n, data: { ...n.data, ...node.data } };
        return result;
      }),
    );
  }, [candidate, setNodes]);

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
      minZoom={0.1}
      proOptions={{ hideAttribution: true }}
    >
      <Controls />
    </ReactFlow>
  );
});

interface GraphBoxProps extends BoxProps {
  sessionId: string;
}

const GraphBox: React.FC<GraphBoxProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);

  return session.loaded ? (
    <></>
  ) : (
    <ReactFlowProvider>
      <Flow sessionId={sessionId} />
    </ReactFlowProvider>
  );
});

export default GraphBox;
