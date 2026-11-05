import React from 'react';
import { observer } from 'mobx-react-lite';
import { Handle, NodeProps, Position } from 'reactflow';
import { CanvasLineageNodeData } from '../../../store/canvas/canvas.model';
import { useCanvasStore } from '../canvas-context';

// The arrows only need somewhere to attach: the chip's middle left and right.
const hiddenHandle: React.CSSProperties = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0 };

/**
 * A query block in the strip at the top of the canvas (see layout.ts's
 * layoutLineage): `|= name`, or the block's number when it has no name. A
 * named block above the drawn one also says what it ends in, like
 * `limit 1 per company_id`. A red dot: the block changes data. It is a chip,
 * not a table card, so it never reads as a table in the join graph below.
 *
 * Clicking a chip draws its block (CanvasStore.selectQuery). A chip can also
 * be dragged along the strip; a drag is not a click.
 */
const LineageNode: React.FC<NodeProps<CanvasLineageNodeData>> = observer(({ data }) => {
  const canvasStore = useCanvasStore();
  // A named block above the drawn one is nested in it: drawn dashed, like its container.
  const nested = !data.active && !!data.name && data.block < canvasStore.mainBlock;
  // Where the press started: a click after the pointer moved is the end of a drag.
  const pressed = React.useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className="nopan"
      data-testid={`lineage-${data.block}`}
      title={
        data.active
          ? 'The query the canvas draws, and Run runs'
          : `Draw this query${data.write ? '. It changes data' : ''}`
      }
      onMouseDown={e => {
        pressed.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={e => {
        e.stopPropagation();
        const from = pressed.current;
        if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 3) return;
        canvasStore.selectQuery(data.block);
      }}
      style={{
        width: data.width,
        height: data.height,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: data.detail ? 'flex-start' : 'center',
        padding: '0 10px',
        borderRadius: data.height / 2,
        border: data.active
          ? '1.5px solid var(--canvas-node-border-current)'
          : data.expanded
            ? '1.5px solid var(--canvas-container-border)'
            : nested
              ? '1.5px dashed var(--canvas-container-border)'
              : '1.5px solid var(--canvas-node-border)',
        background: data.active || data.expanded ? 'var(--canvas-node-bg-current)' : 'var(--canvas-node-bg)',
        color: data.active ? 'var(--canvas-text)' : nested ? 'var(--canvas-container-border)' : 'var(--canvas-text-dim)',
        fontFamily: 'var(--canvas-font)',
        fontSize: 'calc(11px * var(--text-scale, 1))',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        cursor: data.active ? 'default' : 'pointer',
        lineHeight: 1.2,
        // ReactFlow turns pointer events off on a node that can't be
        // selected; the chip takes its own clicks.
        pointerEvents: 'auto',
      }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} style={hiddenHandle} />
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {data.write && (
          <span
            style={{ width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: 'var(--canvas-warn)' }}
          />
        )}
        {data.label}
      </span>
      {data.detail && (
        <span
          style={{
            fontSize: 'calc(10px * var(--text-scale, 1))',
            fontWeight: 400,
            color: 'var(--canvas-text-dim)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {data.detail}
        </span>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} style={hiddenHandle} />
    </div>
  );
});

export default LineageNode;
