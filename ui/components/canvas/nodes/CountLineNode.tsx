import React from 'react';
import { observer } from 'mobx-react-lite';
import { NodeProps } from 'reactflow';
import { CanvasCountNodeData } from '../../../store/canvas/canvas.model';
import { lineHeight } from '../../../store/canvas/layout';
import { useCanvasStore } from '../canvas-context';

/**
 * The query ends in `count:`: a dotted line under the whole graph, drawn
 * like a group's line, since it seals everything above it into one number.
 * Its × takes the count off. Steps added later go in above it
 * (CanvasStore.runCommit), so it stays last.
 */
const CountLineNode: React.FC<NodeProps<CanvasCountNodeData>> = observer(({ data }) => {
  const canvasStore = useCanvasStore();
  return (
    <div
      data-testid="count-line"
      style={{ position: 'relative', width: data.width, height: lineHeight, fontFamily: 'var(--canvas-font)' }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: lineHeight / 2,
          borderTop: '1.5px dashed var(--canvas-container-border)',
        }}
      />
      <div
        className="nodrag"
        style={{
          // ReactFlow turns pointer events off on a node that can be neither
          // selected nor dragged. The label and its × opt back in.
          pointerEvents: 'auto',
          position: 'absolute',
          left: 24,
          top: 0,
          height: lineHeight,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 6px',
          background: 'var(--canvas-bg)',
          fontSize: 'calc(11px * var(--text-scale, 1))',
          color: 'var(--canvas-text-dim)',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: 'var(--canvas-container-label)', fontWeight: 600 }}>count</span>
        <span
          data-testid="count-delete"
          className="picker-trigger"
          title="Remove the count: the query shows its rows again"
          onClick={e => {
            e.stopPropagation();
            void canvasStore.removeCount();
          }}
          style={{ cursor: 'pointer', opacity: 0.7 }}
        >
          &times;
        </span>
      </div>
    </div>
  );
});

export default CountLineNode;
