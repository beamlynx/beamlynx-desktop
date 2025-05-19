import { useEffect, useRef, useState } from 'react';
import ReactFlow, { Controls, Node, ReactFlowProvider, useEdgesState, useNodesState } from 'reactflow';
import 'reactflow/dist/base.css';
import 'reactflow/dist/style.css';
import { InputNode, InputNodeData } from './nodes/InputNode';
import { useStores } from '../../store/store-container';

// Define node types
const NodeType = {
  Input: 'input',
} as const;

const nodeTypes = {
  [NodeType.Input]: InputNode,
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
    label: expression,
    isFocused,
  },
});

const Flow = ({ sessionId }: { sessionId: string }) => {
  const [isFocused, setIsFocused] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);

  const { global } = useStores();
  const session = global.getSession(sessionId);

  // Initialize nodes and edges
  const [nodes, setNodes, onNodesChange] = useNodesState([
    createInputNode(sessionId, session.expression, isFocused),
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Update nodes when container focus state changes
  useEffect(() => {
    setNodes(nodes =>
      nodes.map(node =>
        node.id === 'input' ? { ...node, data: { ...node.data, isFocused } } : node,
      ),
    );
  }, [isFocused, setNodes]);

  /**
   * Global event handler for Ctrl+A
   */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', fn);
    return () => {
      document.removeEventListener('keydown', fn);
    };
  }, []);

  // Handle keyboard events on the flow container
  useEffect(() => {
    const handleKeyDownFn = async (event: KeyboardEvent) => {
      if (session.inputMode !== 'visual') {
        return;
      }
      // Only handle events without modifier keys
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
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
        const newExpression = session.expression.slice(0, -1);
        session.expression = newExpression;
        setNodes(nodes =>
          nodes.map(node =>
            node.id === 'input' ? { ...node, data: { ...node.data, label: newExpression } } : node,
          ),
        );
        return;
      }

      // Handle other keys
      if (event.key.length === 1) {
        event.preventDefault();
        const newExpression = session.expression + event.key;
        session.expression = newExpression;
        setNodes(nodes =>
          nodes.map(node =>
            node.id === 'input' ? { ...node, data: { ...node.data, label: newExpression } } : node,
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
};

const VisualInput = ({ sessionId }: { sessionId: string }) => {
  return (
    <ReactFlowProvider>
      <Flow sessionId={sessionId} />
    </ReactFlowProvider>
  );
};

export default VisualInput;
