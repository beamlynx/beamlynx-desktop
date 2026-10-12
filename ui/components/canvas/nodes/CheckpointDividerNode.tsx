import React from 'react';
import { observer } from 'mobx-react-lite';
import { NodeProps } from 'reactflow';
import { CanvasDividerNodeData } from '../../../store/canvas/canvas.model';
import { useCanvasStore } from '../canvas-context';
import { DeleteButton } from './TableNode';

/**
 * A checkpoint, drawn as a dashed line across the canvas: below it is the
 * node named after the checkpoint, which works on its sealed result. See
 * layout.ts's buildCanvasGraph for where it goes.
 *
 * The label at the left edge says what the checkpoint does (`limit 10`,
 * `limit 1 per c.id`, `group t.title → count`). A limit's label opens the
 * limit editor for this checkpoint's own number. The × removes the
 * checkpoint (CanvasStore.deleteCheckpoint).
 *
 * Only the label and × take clicks. The rest of the line lets them through,
 * so a rubber-band selection can start on it - layout.ts also sets
 * `pointerEvents: 'none'` on ReactFlow's own wrapper for the same reason.
 */
const CheckpointDividerNode: React.FC<NodeProps<CanvasDividerNodeData>> = observer(({ data }) => {
  const canvasStore = useCanvasStore();
  const editable = data.limit !== undefined;

  return (
    <div
      data-testid={`checkpoint-divider-${data.name}`}
      style={{
        width: data.width,
        height: 24,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          borderTop: '1.5px dashed var(--canvas-container-border)',
        }}
      />
      <div
        className="nodrag nopan"
        style={{
          position: 'relative',
          marginLeft: 12,
          paddingRight: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          background: 'var(--canvas-bg)',
          pointerEvents: 'auto',
        }}
      >
        {/* Written as pine-lang reports it - not uppercased like the action
            buttons, since it carries column names (`c.id`). A limit's label
            is a picker trigger (see TableNode.tsx's ActionButton for what
            `picker-trigger` does). */}
        <span
          data-testid={`checkpoint-label-${data.name}`}
          className={editable ? 'picker-trigger' : undefined}
          title={editable ? 'Change the limit' : undefined}
          onClick={
            editable
              ? e => {
                  e.stopPropagation();
                  canvasStore.openLimitEditor(data.name, { x: e.clientX, y: e.clientY }, data.name);
                }
              : undefined
          }
          style={{
            fontSize: 'calc(11px * var(--text-scale, 1))',
            lineHeight: 'calc(11px * var(--text-scale, 1))',
            fontFamily: 'var(--canvas-font)',
            fontWeight: 600,
            padding: '2px 4px',
            color: editable ? 'var(--canvas-trace)' : 'var(--canvas-text-dim)',
            cursor: editable ? 'pointer' : undefined,
            whiteSpace: 'nowrap',
          }}
        >
          {data.label}
        </span>
        <DeleteButton
          testId={`checkpoint-delete-${data.name}`}
          title="Remove checkpoint"
          onClick={() => void canvasStore.deleteCheckpoint(data.name)}
          style={{ position: 'static' }}
        />
      </div>
    </div>
  );
});

export default CheckpointDividerNode;
