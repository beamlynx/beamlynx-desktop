import { useEffect, useRef, useMemo } from 'react';
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
import { runInAction } from 'mobx';
import 'reactflow/dist/style.css';
import { PineNode, PineSuggestedNode } from '../model';
import {
  getLayoutedElements,
  getNodeHeight,
  isUncertainResolution,
  makeSuggestedNode,
  nodeWidth,
  uncertainEdgeStyle,
} from '../store/graph.util';
import { useStores } from '../store/store-container';
import SelectedNodeComponent from './SelectedNodeComponent';
import SuggestedNodeComponent from './SuggestedNodeComponent';
import VariableNodeComponent from './VariableNodeComponent';
import { CloseFullscreen, OpenInFull } from '@mui/icons-material';

export const NodeType = {
  Selected: 'selected-node',
  Suggested: 'suggested-node',
  Variable: 'variable-node',
};
const nodeTypes: NodeTypes = {
  [NodeType.Suggested]: SuggestedNodeComponent,
  [NodeType.Selected]: SelectedNodeComponent,
  [NodeType.Variable]: VariableNodeComponent,
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

  const { layoutedNodes, layoutedEdges, candidateNode } = useMemo(() => {
    const allNodes = [...graph.selectedNodes, ...graph.suggestedNodes];
    const { nodes, edges } = getLayoutedElements(nodePositionCache, allNodes, graph.edges);

    let foundCandidate = null;
    if (graph.candidate) {
      const candidateInLayout = nodes.find(n => n.id === graph.candidate!.pine);
      if (candidateInLayout && candidateInLayout.type === NodeType.Suggested) {
        foundCandidate = candidateInLayout as PineSuggestedNode;
      }
    }

    // An edge touching a suggested node gets styled here, in local component
    // state, rather than inside generateGraph/session.graph - session.graph is
    // a deep MobX observable (makeAutoObservable), and handing ReactFlow a
    // style object that MobX has wrapped into an observable Proxy crashes its
    // DOM style diffing. Building fresh, plain style objects here keeps them
    // out of the observable tree entirely.
    const suggestedResolutionById = new Map(graph.suggestedNodes.map(n => [n.id, n.data.resolution]));
    const styledEdges = edges.map(e => {
      const resolution = suggestedResolutionById.get(e.source) ?? suggestedResolutionById.get(e.target);
      return isUncertainResolution(resolution) ? { ...e, style: uncertainEdgeStyle } : e;
    });

    return { layoutedNodes: nodes, layoutedEdges: styledEdges, candidateNode: foundCandidate };
  }, [graph.selectedNodes, graph.suggestedNodes, graph.edges, graph.candidate]);

  // Update graph nodes and edges
  useEffect(() => {
    let finalNodes: PineNode[] = layoutedNodes;
    let finalEdges = layoutedEdges;

    if (candidateNode) {
      finalNodes = layoutedNodes.map(n => {
        if (n.id === candidateNode.id) {
          const isDark = global.theme === 'dark';
          const suggestedNode = n as PineSuggestedNode;
          const node = makeSuggestedNode(suggestedNode.data, sessionId, true, isDark);
          return { ...suggestedNode, data: { ...suggestedNode.data, ...node.data } };
        }
        return n;
      });

      // A suggested node has at most one relation, so at most one edge
      // touches it - highlight that edge the same way the node itself gets
      // highlighted, so the candidate's connection is as obvious as the
      // candidate itself.
      finalEdges = layoutedEdges.map(e =>
        e.source === candidateNode.id || e.target === candidateNode.id
          ? { ...e, style: { ...e.style, stroke: 'var(--node-candidate-border)', strokeWidth: 2.5 }, zIndex: 1 }
          : e,
      );
    }

    setNodes(finalNodes);
    setEdges(finalEdges);
  }, [layoutedNodes, layoutedEdges, candidateNode, global.theme, sessionId, setNodes, setEdges]);

  // Center view on candidate or fit view
  useEffect(() => {
    if (candidateNode) {
      const renderedCandidate = nodes.find(n => n.id === candidateNode.id);
      if (!renderedCandidate) return;

      const isVisible = isNodeVisible(renderedCandidate, reactFlowInstance, containerRef.current);
      if (isVisible) return;

      reactFlowInstance.setCenter(renderedCandidate.position.x, renderedCandidate.position.y, {
        duration: 300,
        zoom: 1,
      });
    } else {
      if (nodes.length === 0) return;
      reactFlowInstance.fitView({ duration: 300 });
    }
  }, [nodes, candidateNode, reactFlowInstance, containerRef]);

  // Add handler for node movement
  const onNodeDragStop = (event: React.MouseEvent, node: PineNode) => {
    if (node.data.type === 'selected') {
      nodePositionCache[node.data.alias] = node.position;
    } else if (node.data.type === 'variable') {
      nodePositionCache[`var:${node.data.variableName}`] = node.position;
    }
  };

  if (session.inputMode === 'sql') {
    return (
      <div
        style={{
          padding: '8px 12px',
          fontSize: '12px',
          fontFamily: 'monospace',
          color: 'gray',
        }}
      >
        SQL mode enabled. You can edit the SQL query directly in the input.
      </div>
    );
  }

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
      // The graph is a derived view of the Pine expression, not an editable
      // canvas - React Flow's default Backspace/Delete key removes the
      // selected node/edge from local state, but nothing about the
      // underlying expression changes, so it silently reappears on the next
      // graph regeneration. Disable it so there's no dead-end "delete" that
      // doesn't actually do anything.
      deleteKeyCode={null}
      minZoom={0.5}
      maxZoom={1.2}
      proOptions={{ hideAttribution: true }}
      zoomOnScroll={true}
      nodeDragThreshold={1}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 10,
          cursor: 'pointer',
          color: 'var(--text-color)',
          '&:hover': {
            color: 'var(--primary-color)',
          },
        }}
        onClick={() =>
          runInAction(() => {
            session.mode = session.mode === 'graph' ? 'result' : 'graph';
          })
        }
      >
        {session.mode === 'graph' ? <CloseFullscreen /> : <OpenInFull />}
      </Box>
      {/* <Controls /> */}
    </ReactFlow>
  );
});

interface GraphBoxProps extends BoxProps {
  sessionId: string;
}

const GraphBox: React.FC<GraphBoxProps> = observer(({ sessionId, ...boxProps }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { global } = useStores();
  const session = global.getSession(sessionId);
  return (
    <Box
      {...boxProps}
      ref={ref}
      sx={{ height: '100%', width: '100%' }}
      onFocus={e => {
        // React Flow makes every node/edge natively tabbable (tabIndex=0),
        // so pressing Tab anywhere near the graph can land keyboard focus
        // on one -- confirmed this isn't gated on the click itself giving
        // the clicked node DOM focus (it doesn't; focus stays on <body>
        // until Tab's own default browser navigation lands it on a node).
        // The graph is a read-only view of the expression, not something to
        // navigate independently of it, so redirect immediately: blur
        // whatever just got focused and hand off to the same
        // candidate-cycling Tab already does in the input (see PineInput's
        // tabCycleRequestCount effect). React's onFocus (unlike the native
        // `focus` event) bubbles, so this catches every node/edge without
        // needing a listener on each one.
        const target = e.target as HTMLElement;
        if (target !== e.currentTarget) {
          target.blur();
          session.requestTabCycle();
        }
      }}
    >
      <ReactFlowProvider>
        <Flow sessionId={sessionId} containerRef={ref} />
      </ReactFlowProvider>
    </Box>
  );
});

export default GraphBox;
