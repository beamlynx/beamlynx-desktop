import React from 'react';
import { observer } from 'mobx-react-lite';
import { NodeProps } from 'reactflow';
import { CanvasStartNodeData, START_NODE_ID } from '../../../store/canvas/canvas.model';
import { useCanvasStore } from '../canvas-context';

const startNodeWidth = 160;
const startNodeHeight = 64;

const StartNode: React.FC<NodeProps<CanvasStartNodeData>> = observer(() => {
  const canvasStore = useCanvasStore();
  // The Start node only ever exists while the graph is empty (Canvas.tsx
  // swaps it in for `canvasGraph.nodes` in that case), so it's always the
  // sole focus target then - see CanvasStore.orderedFocusTargets. Shown as
  // "current" exactly like a focused TableNode - see the comment on
  // TableNode.tsx's own isFocusTarget for why this doubles as the AST's
  // current-node treatment without eagerly touching the AST itself.
  const isFocusTarget = canvasStore.focusedAlias === START_NODE_ID;
  const showKeyHint = isFocusTarget && canvasStore.mode === 'normal';

  return (
    <div
      data-testid={`canvas-node-${START_NODE_ID}`}
      className="nodrag picker-trigger"
      onClick={e => canvasStore.openTablePicker({ x: e.clientX, y: e.clientY })}
      style={{
        boxSizing: 'border-box',
        width: startNodeWidth,
        height: startNodeHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: isFocusTarget
          ? '3px dashed var(--canvas-node-border-current)'
          : '2px dashed var(--canvas-node-border)',
        borderRadius: '3px',
        background: isFocusTarget ? 'var(--canvas-node-bg-current)' : 'transparent',
        color: 'var(--canvas-text-dim)',
        fontSize: '11px',
        fontFamily: 'var(--canvas-font)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.4px',
        cursor: 'pointer',
      }}
    >
      {showKeyHint ? (
        <>
          +&nbsp;<span style={{ fontWeight: 800 }}>I</span>
          <span style={{ color: 'var(--canvas-text-dim)' }}>nsert</span>
        </>
      ) : (
        '+ pick a table'
      )}
    </div>
  );
});

export default StartNode;
