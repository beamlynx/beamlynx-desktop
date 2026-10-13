import React from 'react';
import { observer } from 'mobx-react-lite';
import { Handle, NodeProps, Position } from 'reactflow';
import { CanvasLineageNodeData } from '../../../store/canvas/canvas.model';
import { useCanvasStore } from '../canvas-context';

// The arrows only need somewhere to attach: the chip's middle left and right.
const hiddenHandle: React.CSSProperties = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0 };

/**
 * A query block in the lineage strip at the top of the canvas (see
 * layout.ts's layoutLineage): `|= name`, and what the block ends in, like
 * `limit 1 per company_id`. The last block, the one the canvas draws, is
 * `query`. It is a chip, not a table card, so it never reads as a table in
 * the join graph below.
 *
 * Clicking a block's chip expands its nested query on the canvas, or
 * collapses it; clicking `query` collapses whatever is expanded.
 */
const LineageNode: React.FC<NodeProps<CanvasLineageNodeData>> = observer(({ data }) => {
  const canvasStore = useCanvasStore();
  const main = !data.name;
  return (
    <div
      className="nodrag nopan"
      data-testid={`lineage-${data.name || 'query'}`}
      title={main ? 'The query the canvas draws' : data.expanded ? 'Collapse' : `Expand: show what ${data.name} holds`}
      onClick={e => {
        e.stopPropagation();
        if (main) canvasStore.collapseNested();
        else canvasStore.toggleNested(data.name);
      }}
      style={{
        width: data.width,
        height: data.height,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 10px',
        borderRadius: data.height / 2,
        border: data.expanded
          ? '1.5px solid var(--canvas-container-border)'
          : main
            ? '1.5px solid var(--canvas-node-border)'
            : '1.5px dashed var(--canvas-container-border)',
        background: data.expanded ? 'var(--canvas-node-bg-current)' : 'var(--canvas-node-bg)',
        color: main ? 'var(--canvas-text)' : 'var(--canvas-container-border)',
        fontFamily: 'var(--canvas-font)',
        fontSize: 'calc(11px * var(--text-scale, 1))',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        lineHeight: 1.2,
        // ReactFlow turns pointer events off on a node that can't be
        // selected or dragged; the chip takes its own clicks.
        pointerEvents: 'auto',
      }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} style={hiddenHandle} />
      <span>{main ? 'query' : `|= ${data.name}`}</span>
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
