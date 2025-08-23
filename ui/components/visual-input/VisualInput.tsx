import { useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Controls,
  Node,
  NodeTypes,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/base.css';
import 'reactflow/dist/style.css';
import { observer } from 'mobx-react-lite';
import { InputNode } from './nodes/InputNode';
import { useStores } from '../../store/store-container';
import { getLayoutedElements } from '../../store/graph.util';
import SuggestedNodeComponent from '../SuggestedNodeComponent';
import SelectedNodeComponent from '../SelectedNodeComponent';
import { InputNodeData, PineNode } from '../../model';

// Define node types
const NodeType = {
  Input: 'input-node',
  Selected: 'selected-node',
  Suggested: 'suggested-node',
} as const;

const nodeTypes: NodeTypes = {
  [NodeType.Input]: InputNode,
  [NodeType.Selected]: SelectedNodeComponent,
  [NodeType.Suggested]: SuggestedNodeComponent,
};

const createInputNode = (
  sessionId: string,
  expression: string,
  isFocused: boolean,
): Node<InputNodeData> => ({
  id: 'input',
  type: NodeType.Input,
  position: { x: 0, y: 0 },
  style: {
    border: '0px',
  },
  data: {
    sessionId,
    type: 'input',
    alias: 'input',
    operation: 'table',
    expression,
    isFocused,
  },
});

const nodePositionCache: Record<string, { x: number; y: number }> = {};

const Flow = observer(({ sessionId }: { sessionId: string }) => {
  const [isFocused, setIsFocused] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);

  const { global } = useStores();
  const session = global.getSession(sessionId);
  const { graph } = session;

  // Initialize nodes and edges
  // TOOD: fix type
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([
    createInputNode(sessionId, session.expression, isFocused),
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowInstance = useReactFlow();

  // Update nodes
  // Render graph
  useEffect(() => {
    const n = [
      createInputNode(sessionId, session.expression, isFocused),
      ...graph.selectedNodes,
      ...graph.suggestedNodes,
    ];
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
    sessionId,
    session.expression,
    isFocused,
    reactFlowInstance,
  ]);

  // Update nodes when container focus state changes
  // useEffect(() => {
  //   setNodes(nodes =>
  //     nodes.map(node =>
  //       node.id === 'input' ? { ...node, data: { ...node.data, isFocused } } : node,
  //     ),
  //   );
  // }, [isFocused, setNodes]);



  // Handle keyboard events on the flow container
  useEffect(() => {
    const handleKeyDownFn = async (event: KeyboardEvent) => {
      if (session.inputMode !== 'visual') {
        return;
      }
      // Allow browser shortcuts with modifier keys (like Ctrl+R for reload)
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      event.stopPropagation();

      if (event.key === 'Enter') {
        event.preventDefault();
        await session.evaluate();
        return;
      }

      // Handle backspace
      if (event.key === 'Backspace') {
        event.preventDefault();
        const expression = session.expression.slice(0, -1);
        const operation = session.operation.type;
        session.expression = expression;
        setNodes(nodes =>
          nodes.map(node =>
            node.id === 'input' ? { ...node, data: { ...node.data, expression, operation } } : node,
          ),
        );
        return;
      }

      // Handle other keys
      console.log(event.key);
      if (event.key.length === 1) {
        event.preventDefault();
        const expression = session.expression + event.key;
        const operation = session.operation.type;
        session.expression = expression;
        session.message = session.expression;
        setNodes(nodes =>
          nodes.map(node =>
            node.id === 'input' ? { ...node, data: { ...node.data, expression, operation } } : node,
          ),
        );
        return;
      }
    };

    const container = flowRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDownFn);
      return () => {
        container.removeEventListener('keydown', handleKeyDownFn);
      };
    }
  }, [session, setNodes]);

  const onNodeDragStop = (event: React.MouseEvent, node: PineNode) => {
    if (node.data.type === 'input') {
      // Cache the position using the node's id as the key
      nodePositionCache[node.data.alias] = node.position;
    }
  };

  return (
    <div
      ref={flowRef}
      style={{ width: '100%', height: '100%', outline: 'none' }}
      tabIndex={0}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        maxZoom={1.2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={false}
        nodesFocusable={false}
      >
        <Controls />
      </ReactFlow>
    </div>
  );
});

const VisualInput = ({ sessionId }: { sessionId: string }) => {
  return (
    <ReactFlowProvider>
      <Flow sessionId={sessionId} />
    </ReactFlowProvider>
  );
};

export default VisualInput;
