import React from 'react';
import { observer } from 'mobx-react-lite';
import { NodeProps } from 'reactflow';
import { CanvasNameNodeData, NAME_NODE_ID } from '../../../store/canvas/canvas.model';
import { lineHeight } from '../../../store/canvas/layout';
import { useCanvasStore } from '../canvas-context';

/**
 * The query ends in `|= name`: a dotted line under the whole graph (and its
 * count line) that names the query's result, so a later query can read it.
 * The last keyboard stop. Clicking the name renames it; its ×, or `x` on the
 * line, takes the name off (CanvasStore.removeQueryName).
 */
const NameLineNode: React.FC<NodeProps<CanvasNameNodeData>> = observer(({ data }) => {
  const canvasStore = useCanvasStore();
  const focused = canvasStore.focusedAlias === NAME_NODE_ID;
  const anchorOf = (e: React.MouseEvent) => ({ x: e.clientX, y: e.clientY });
  return (
    <div
      data-testid="name-line"
      style={{ position: 'relative', width: data.width, height: lineHeight, fontFamily: 'var(--canvas-font)' }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: lineHeight / 2,
          borderTop: `${focused ? 2.5 : 1.5}px dashed ${focused ? 'var(--canvas-node-border-current)' : 'var(--canvas-container-border)'}`,
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
        <span
          data-testid="name-label"
          className="picker-trigger"
          title="The name of the query's result: a later query can read it like a table. Click to rename it"
          onClick={e => {
            e.stopPropagation();
            canvasStore.focusNode(NAME_NODE_ID);
            canvasStore.openQueryNameEditor(anchorOf(e));
          }}
          style={{ cursor: 'pointer', fontWeight: 600, color: focused ? 'var(--canvas-text)' : 'var(--canvas-container-border)' }}
        >
          |= {data.name}
        </span>
        <span
          data-testid="name-delete"
          className="picker-trigger"
          title="Remove the name"
          onClick={e => {
            e.stopPropagation();
            canvasStore.removeQueryName(anchorOf(e));
          }}
          style={{ cursor: 'pointer', opacity: 0.7 }}
        >
          &times;
        </span>
      </div>
    </div>
  );
});

export default NameLineNode;
