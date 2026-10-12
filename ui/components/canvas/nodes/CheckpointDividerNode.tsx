import React from 'react';
import { observer } from 'mobx-react-lite';
import { NodeProps } from 'reactflow';
import { CanvasDividerNodeData } from '../../../store/canvas/canvas.model';
import { useCanvasStore } from '../canvas-context';

// The line and the connector are one stroke: same colour, same weight.
const stroke = '1.5px dashed var(--canvas-container-border)';
const lineY = 12; // the line's height in the node - layout.ts's dividerHeight / 2
const pillHeight = 18; // layout.ts's pillHalfHeight * 2

/**
 * A checkpoint, drawn as a dashed line with a pill on it, right above the
 * checkpoint's node: the node stands for everything above the line. See
 * layout.ts's buildCanvasGraph for where it goes.
 *
 * - The line crosses the canvas when the checkpoint is expanded, with the
 *   stage it seals above it. Collapsed, it is a short stub: the pill alone
 *   says the node is a nested query.
 * - The pill is the junction. It sits on the line, centred on the node, and
 *   the connector runs from its bottom edge down to the node's box (passing
 *   behind the node's action bar).
 * - The pill holds the expand/collapse toggle, the label (`limit 10`,
 *   `limit 1 per c.id`, `group t.title → count` - a limit's label opens the
 *   limit editor for this checkpoint), and × to remove the checkpoint.
 *
 * Only the pill takes clicks. The rest lets them through, so a rubber-band
 * selection can start on the line - layout.ts also sets `pointerEvents:
 * 'none'` on ReactFlow's own wrapper for the same reason.
 */
const CheckpointDividerNode: React.FC<NodeProps<CanvasDividerNodeData>> = observer(({ data }) => {
  const canvasStore = useCanvasStore();
  const editable = data.limit !== undefined;
  const pillBottom = lineY + pillHeight / 2;

  return (
    <div
      data-testid={`checkpoint-divider-${data.name}`}
      style={{
        width: data.width,
        height: pillBottom + data.connector,
        position: 'relative',
        pointerEvents: 'none',
      }}
    >
      <div
        aria-hidden
        style={{ position: 'absolute', left: 0, right: 0, top: lineY - 0.75, borderTop: stroke }}
      />
      <div
        aria-hidden
        data-testid={`checkpoint-connector-${data.name}`}
        style={{
          position: 'absolute',
          left: data.pillX - 0.75,
          top: pillBottom,
          height: data.connector,
          borderLeft: stroke,
        }}
      />
      <div
        data-testid={`checkpoint-pill-${data.name}`}
        className="nodrag nopan"
        style={{
          position: 'absolute',
          left: data.pillX,
          top: lineY - pillHeight / 2,
          height: pillHeight,
          transform: 'translateX(-50%)',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 6px',
          border: '1.5px solid var(--canvas-container-border)',
          borderRadius: pillHeight / 2,
          background: 'var(--canvas-bg)',
          fontSize: 'calc(10px * var(--text-scale, 1))',
          lineHeight: 1,
          fontFamily: 'var(--canvas-font)',
          whiteSpace: 'nowrap',
          pointerEvents: 'auto',
        }}
      >
        <span
          data-testid={`checkpoint-toggle-${data.name}`}
          title={
            data.expanded
              ? 'Collapse: hide what this checkpoint seals (e)'
              : 'Expand: show what this checkpoint seals (e)'
          }
          onClick={e => {
            e.stopPropagation();
            canvasStore.toggleNested(data.name);
          }}
          style={{ cursor: 'pointer', color: 'var(--canvas-text-dim)' }}
        >
          {data.expanded ? '▾' : '▸'}
        </span>
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
            fontWeight: 600,
            color: editable ? 'var(--canvas-trace)' : 'var(--canvas-text-dim)',
            cursor: editable ? 'pointer' : undefined,
          }}
        >
          {data.label}
        </span>
        {/* A named block is removed from the text, not from here. */}
        {data.kind === 'checkpoint' && (
          <span
            data-testid={`checkpoint-delete-${data.name}`}
            title="Remove checkpoint"
            onClick={e => {
              e.stopPropagation();
              void canvasStore.deleteCheckpoint(data.name);
            }}
            style={{
              cursor: 'pointer',
              color: 'var(--canvas-text-dim)',
              fontSize: 'calc(11px * var(--text-scale, 1))',
            }}
          >
            &times;
          </span>
        )}
      </div>
    </div>
  );
});

export default CheckpointDividerNode;
