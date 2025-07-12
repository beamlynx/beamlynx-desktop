import { useEffect, useRef } from 'react';
import ReactFlow, {
  ConnectionLineType,
  NodeTypes,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';

import { Box, BoxProps } from '@mui/material';
import { observer } from 'mobx-react-lite';
import 'reactflow/dist/style.css';
import { PineNode, PineSuggestedNode } from '../model';
import { getLayoutedElements, getNodeHeight, makeSuggestedNode, nodeWidth } from '../store/graph.util';
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

const isNodeVisible = (
  node: PineNode,
  rfInstance: ReturnType<typeof useReactFlow>,
  container: HTMLDivElement | null,
): boolean => {
  if (!container) {
    return false;
  }

  const { x: viewX, y: viewY, zoom } = rfInstance.getViewport();
  const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();

  const nodeWidthVal = nodeWidth;
  const nodeHeightVal = getNodeHeight(node);

  // Viewport boundaries in graph coordinates
  const viewLeft = -viewX / zoom;
  const viewRight = (-viewX + containerWidth) / zoom;
  const viewTop = -viewY / zoom;
  const viewBottom = (-viewY + containerHeight) / zoom;

  // Node boundaries in graph coordinates
  const nodeLeft = node.position.x;
  const nodeRight = node.position.x + nodeWidthVal;
  const nodeTop = node.position.y;
  const nodeBottom = node.position.y + nodeHeightVal;

  const xVisible = nodeRight > viewLeft && nodeLeft < viewRight;
  const yVisible = nodeBottom > viewTop && nodeTop < viewBottom;

  return xVisible && yVisible;
};

interface FlowProps {
  sessionId: string;
  containerRef: React.RefObject<HTMLDivElement>;
}

const Flow: React.FC<FlowProps> = observer(({ sessionId, containerRef }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
  const { graph } = session;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowInstance = useReactFlow();

  // Render graph
  useEffect(() => {
    // 1. Layout nodes
    const n = [...graph.selectedNodes, ...graph.suggestedNodes];
    const { nodes: layoutedNodes, edges } = getLayoutedElements(nodePositionCache, n, graph.edges);

    let finalNodes: PineNode[] = layoutedNodes;
    let candidateNode: PineSuggestedNode | null = null;

    // 2. Deal with candidate
    if (graph.candidate) {
      const pine = graph.candidate.pine;
      const foundNode = layoutedNodes.find(n => n.id === pine);

      if (foundNode && foundNode.type === NodeType.Suggested) {
        candidateNode = foundNode as PineSuggestedNode;
        finalNodes = layoutedNodes.map(n => {
          if (n.id === candidateNode!.id) {
            const isDark = global.theme === 'dark';
            const suggestedNode = n as PineSuggestedNode;
            const node = makeSuggestedNode(suggestedNode.data, sessionId, true, isDark);
            return { ...suggestedNode, data: { ...suggestedNode.data, ...node.data } };
          }
          return n;
        });
      }
    }

    setNodes(finalNodes);
    setEdges(edges);

    if (candidateNode) {
      const isVisible = isNodeVisible(candidateNode, reactFlowInstance, containerRef.current);

      if (isVisible) return;
      setTimeout(() => {
        reactFlowInstance.setCenter(candidateNode!.position.x, candidateNode!.position.y, {
          duration: 200,
          zoom: 1,
        });
      }, 100);
    } else {
      setTimeout(() => {
        reactFlowInstance.fitView({ duration: 200 });
      }, 100);
    }
  }, [
    graph.selectedNodes,
    graph.suggestedNodes,
    graph.edges,
    graph.candidate,
    global.theme,
    sessionId,
    setNodes,
    setEdges,
    reactFlowInstance,
  ]);

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

const GraphBox: React.FC<GraphBoxProps> = observer(({ sessionId, ...boxProps }) => {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Box {...boxProps} ref={ref} sx={{ height: '100%', width: '100%' }}>
      <ReactFlowProvider>
        <Flow sessionId={sessionId} containerRef={ref} />
      </ReactFlowProvider>
    </Box>
  );
});

export default GraphBox;
