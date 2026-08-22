import React from 'react';
import { observer } from 'mobx-react-lite';
import { CanvasStore } from '../../store/canvas/canvas.store';
import { CanvasTableNodeData, START_NODE_ID } from '../../store/canvas/canvas.model';

/**
 * A shaft that bends once, at a hard 90° corner, into a squared arrowhead -
 * not the rounded/circular "undo" glyph every icon set defaults to. Canvas
 * mode's own signature is exactly this: no curves anywhere (TraceEdge.tsx's
 * orthogonal joins, TableNode.tsx's square pins/notch), so the icon is drawn
 * the same way rather than importing a mismatched icon-font shape. `redo` is
 * the same path mirrored, not a second path - guarantees they stay in sync.
 */
const CornerArrow = ({ redo }: { redo?: boolean }) => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden
    style={redo ? { transform: 'scaleX(-1)' } : undefined}
  >
    <path
      d="M11 4 V10 H5 M8 7 L5 10 L8 13"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
    />
  </svg>
);

const iconButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  cursor: 'pointer',
  color: 'var(--canvas-trace)',
};

const disabledIconButtonStyle: React.CSSProperties = {
  ...iconButtonStyle,
  cursor: 'not-allowed',
  color: 'var(--canvas-text-dim)',
  opacity: 0.5,
};

const Divider = () => (
  <span aria-hidden style={{ color: 'var(--canvas-node-border)', fontSize: '9px' }}>
    |
  </span>
);

/**
 * Always-visible undo/redo, pinned top-left - the corner MultiSelectToolbar
 * (top-center) and Banner (top-right) leave free. Undo/redo walk canvas
 * gestures only (see CanvasStore.applyExpression/undo/redo) - hand-typed
 * edits keep the Pine text editor's own native undo (CodeMirror), by design.
 * Also bound to `u`/`Shift+U` now via useCanvasKeybindings.ts - this stays
 * the click-driven path for mouse-only use, not superseded by it.
 */
const CanvasToolbar: React.FC<{ canvasStore: CanvasStore }> = observer(({ canvasStore }) => (
  <div
    className="nodrag"
    style={{
      position: 'absolute',
      top: 8,
      left: 8,
      zIndex: 15,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 8px',
      borderRadius: 4,
      background: 'var(--canvas-node-bg)',
      border: '1px solid var(--canvas-node-border)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    }}
  >
    <span
      title="Undo last graph action"
      style={canvasStore.canUndo ? iconButtonStyle : disabledIconButtonStyle}
      onClick={() => canvasStore.canUndo && canvasStore.undo()}
    >
      <CornerArrow />
    </span>
    <Divider />
    <span
      title="Redo"
      style={canvasStore.canRedo ? iconButtonStyle : disabledIconButtonStyle}
      onClick={() => canvasStore.canRedo && canvasStore.redo()}
    >
      <CornerArrow redo />
    </span>
  </div>
));

// The armed-key legend per focused-node kind. Not derived from TableNode's/
// FrameNode's own action bars (which would mean this file reaching into a
// rendered node's DOM/props) - a plain lookup kept in sync by hand, same as
// those files' own action lists; all three are short and change together.
const legendFor = (isStart: boolean, isFrame: boolean, removable: boolean): string => {
  if (isStart) return 'i';
  // No 'g' - group isn't offered for a checkpoint's own sealed output (see
  // FrameNode.tsx's doc comment). 'x' here cancels the container itself
  // (CanvasStore.deleteCheckpoint), not a per-table removal.
  if (isFrame) return 's w o i x';
  return ['s', 'w', 'o', 'g', 'i', ...(removable ? ['x'] : [])].join(' ');
};

/**
 * Vim's own status-line convention: bottom-left of the buffer (here, the
 * canvas pane), not folded into the top-left icon toolbar above - it
 * describes the canvas itself, not an app-wide setting. Text and a small
 * square pin-glyph only, no background pill - this system never puts a
 * chip-with-background behind a status readout, only marks and printed
 * text directly on the blueprint (see TableNode.tsx's ChipRow/RelationDots
 * for the same pin shape elsewhere).
 */
export const CanvasModeIndicator: React.FC<{ canvasStore: CanvasStore }> = observer(({ canvasStore }) => {
  const insert = canvasStore.mode === 'insert';
  const alias = canvasStore.focusedAlias;
  const isStart = alias === START_NODE_ID;
  const focusedNode = canvasStore.canvasGraph.nodes.find(n => n.id === alias);
  const isFrame = focusedNode?.type === 'frame-node';
  // `node.type` isn't a literal-discriminated field on reactflow's `Node<T>`
  // (see layout.ts's getNodeHeight comment) - TS can't narrow the union from
  // the `type === 'table-node'` check alone, hence the explicit cast, same
  // trade-off that function always makes.
  const removable =
    focusedNode?.type === 'table-node' ? (focusedNode.data as CanvasTableNodeData).removable : false;

  return (
    <div
      className="nodrag"
      style={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        zIndex: 15,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: '10px',
        fontFamily: 'var(--canvas-font)',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.4px',
        color: insert ? 'var(--canvas-trace)' : 'var(--canvas-text-dim)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          background: insert ? 'var(--canvas-trace)' : 'var(--canvas-text-dim)',
        }}
      />
      <span>{insert ? 'insert' : 'normal'}</span>
      {!insert && <span style={{ opacity: 0.7 }}>· {legendFor(isStart, isFrame, removable)}</span>}
    </div>
  );
});

export default CanvasToolbar;
