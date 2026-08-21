import React from 'react';
import { observer } from 'mobx-react-lite';
import { CanvasStore } from '../../store/canvas/canvas.store';

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
 * No keyboard shortcut yet - click-only for now, by explicit request.
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

export default CanvasToolbar;
