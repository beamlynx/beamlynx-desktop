import { useEffect, useState } from 'react';
import ReactFlow, {
  ConnectionLineType,
  Controls,
  NodeTypes,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';

import { BoxProps } from '@mui/material';
import { observer } from 'mobx-react-lite';
import 'reactflow/dist/style.css';
import { PineNode, PineSuggestedNode } from '../model';
import { getLayoutedElements, makeSuggestedNode } from '../store/graph.util';
import { useStores } from '../store/store-container';
import SelectedNodeComponent from './SelectedNodeComponent';
import SuggestedNodeComponent from './SuggestedNodeComponent';


export const NodeType = {
  Selected: 'selected-node',
  Suggested: 'suggested-node',
};
const nodeTypes: NodeTypes = {
  [NodeType.Suggested]: SuggestedNodeComponent,
  [NodeType.Selected]: SelectedNodeComponent,
};

const nodePositionCache: Record<string, { x: number; y: number }> = {};

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
    const { nodes, edges } = getLayoutedElements(nodePositionCache, n, graph.edges);
    setNodes(nodes);
    setEdges(edges);

    setTimeout(() => {
      reactFlowInstance.fitView({ duration: 200 });
    }, 100);
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

    // Focus on the candidate node
    setTimeout(() => {
      reactFlowInstance.setCenter(node.position.x, node.position.y, { duration: 200, zoom: 1 });
    }, 100);
  }, [graph.candidate, nodes, reactFlowInstance]);

  // Render candidate
  useEffect(() => {
    if (!candidate) {
      return;
    }

    setNodes(nds =>
      nds.map((n: PineSuggestedNode) => {
        const isCandidate = n.id === candidate.id;
        const node = makeSuggestedNode(n.data, sessionId, isCandidate);
        const result = { ...n, data: { ...n.data, ...node.data } };
        return result;
      }),
    );
  }, [candidate, setNodes, sessionId]);

  // Add handler for node movement
  const onNodeDragStop = (event: React.MouseEvent, node: PineNode) => {
    if (node.data.type === 'selected') {
      // Cache the position using the node's alias as the key
      nodePositionCache[node.data.alias] = node.position;
    }
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      connectionLineType={ConnectionLineType.Bezier}
      nodesConnectable={false}
      draggable={true}
      elementsSelectable={true}
      fitView
      minZoom={0.5}
      maxZoom={1.2}
      proOptions={{ hideAttribution: true }}
    >
      {/* <Controls /> */}
    </ReactFlow>
  );
});

interface GraphBoxProps extends BoxProps {
  sessionId: string;
}

const GraphBox: React.FC<GraphBoxProps> = observer(({ sessionId }) => {
  return (
    <ReactFlowProvider>
      <Flow sessionId={sessionId} />
    </ReactFlowProvider>
  );
});

export default GraphBox;
