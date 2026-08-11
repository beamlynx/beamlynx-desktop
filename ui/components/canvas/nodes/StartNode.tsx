import React from 'react';
import { NodeProps } from 'reactflow';
import { CanvasStartNodeData } from '../../../store/canvas/canvas.model';
import { useCanvasStore } from '../canvas-context';

const StartNode: React.FC<NodeProps<CanvasStartNodeData>> = () => {
  const canvasStore = useCanvasStore();
  return (
    <div
      className="nodrag picker-trigger"
      onClick={e => canvasStore.openTablePicker({ x: e.clientX, y: e.clientY })}
      style={{
        width: 160,
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px dashed var(--canvas-node-border)',
        borderRadius: '3px',
        color: 'var(--canvas-text-dim)',
        fontSize: '11px',
        fontFamily: 'var(--canvas-font)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.4px',
        cursor: 'pointer',
      }}
    >
      + pick a table
    </div>
  );
};

export default StartNode;
