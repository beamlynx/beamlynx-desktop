import React from 'react';
import { observer } from 'mobx-react-lite';
import { CanvasStore } from '../../store/canvas/canvas.store';
import { CanvasTableNodeData, START_NODE_ID } from '../../store/canvas/canvas.model';
import { useStores } from '../../store/store-container';

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

/**
 * A filled zigzag, straight segments only - same "no curves" rule as
 * CornerArrow above, just filled rather than stroked (a thin-stroke outline
 * reads poorly as "lightning/instant" at this size; a solid silhouette
 * doesn't). Represents auto-run - the query re-running on its own the
 * instant a canvas gesture commits, the same "instant" association a bolt
 * carries anywhere else.
 */
const Bolt = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
    <path d="M9 1 L3 9 H6.5 L5.5 15 L13 6 H9.5 Z" fill="currentColor" />
  </svg>
);

/**
 * Small text glyphs, not icons - "PINE"/"SQL" match Input.tsx's own
 * ToggleButton labels for the same two editor modes verbatim, so the
 * connection between "this toolbar button" and "that panel" is immediate
 * rather than requiring a new icon vocabulary just for two letters' worth of
 * distinction. Auto-width (unlike the square 22x22 SVG icon buttons above),
 * since fitting "PINE"/"SQL" into a fixed square would force a font size too
 * small to read.
 */
const panelToggleStyle = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 22,
  padding: '0 5px',
  cursor: 'pointer',
  fontSize: 'calc(10px * var(--text-scale, 1))',
  fontFamily: 'var(--canvas-font)',
  fontWeight: 700,
  letterSpacing: '0.4px',
  color: active ? 'var(--canvas-trace)' : 'var(--canvas-text-dim)',
});

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
  <span
    aria-hidden
    style={{ color: 'var(--canvas-node-border)', fontSize: 'calc(9px * var(--text-scale, 1))' }}
  >
    |
  </span>
);

/** An extra icon appended to the toolbar, past a divider, after undo/redo -
 * e.g. New Layout's orientation toggle. Legacy Layout's canvas view (which
 * has no such settings) simply doesn't pass one. */
export interface CanvasToolbarExtraAction {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
}

/**
 * Always-visible undo/redo/auto-run (plus, optionally, one caller-supplied
 * extra action), pinned top-left - the corner MultiSelectToolbar
 * (top-center) and Banner (top-right) leave free. Undo/redo walk canvas
 * gestures only (see CanvasStore.applyExpression/undo/redo) - hand-typed
 * edits keep the Pine text editor's own native undo (CodeMirror), by
 * design. Also bound to `u`/`Shift+U` now via useCanvasKeybindings.ts - this
 * stays the click-driven path for mouse-only use, not superseded by it.
 *
 * Auto-run lives here (not on a Run button) so its state is visible in the
 * same place regardless of layout - Legacy Layout's Run button lives in the
 * Pine/SQL input area, unrelated to the canvas, and New Layout's floating
 * Run button only exists there. This toolbar is the one thing both layouts'
 * canvas view already puts in the same corner.
 */
const CanvasToolbar: React.FC<{ canvasStore: CanvasStore; extraAction?: CanvasToolbarExtraAction }> =
  observer(({ canvasStore, extraAction }) => {
    const { global } = useStores();
    return (
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
        <Divider />
        <span
          title={
            global.autoRunEnabled
              ? 'Auto-run is on - click to run manually instead'
              : 'Auto-run is off - click to run automatically on every canvas edit'
          }
          style={{
            ...iconButtonStyle,
            color: global.autoRunEnabled ? 'var(--canvas-trace)' : 'var(--canvas-text-dim)',
          }}
          onClick={() => global.toggleAutoRunEnabled()}
        >
          <Bolt />
        </span>
        {global.layoutMode === 'new' && (
          <>
            <Divider />
            <span
              title={
                global.newLayoutPanelVisible && canvasStore.session.inputMode === 'pine'
                  ? 'Hide the Pine panel'
                  : 'Show the Pine panel'
              }
              style={panelToggleStyle(global.newLayoutPanelVisible && canvasStore.session.inputMode === 'pine')}
              onClick={() => global.togglePinePanel(canvasStore.session)}
            >
              PINE
            </span>
            <span
              title={
                global.newLayoutPanelVisible && canvasStore.session.inputMode === 'sql'
                  ? 'Hide the SQL panel'
                  : 'Show the SQL panel'
              }
              style={panelToggleStyle(global.newLayoutPanelVisible && canvasStore.session.inputMode === 'sql')}
              onClick={() => global.toggleSqlPanel(canvasStore.session)}
            >
              SQL
            </span>
          </>
        )}
        {extraAction && (
          <>
            <Divider />
            <span title={extraAction.tooltip} style={iconButtonStyle} onClick={extraAction.onClick}>
              {extraAction.icon}
            </span>
          </>
        )}
      </div>
    );
  });

// The armed-key legend per focused-node kind. Not derived from TableNode's/
// FrameNode's own action bars (which would mean this file reaching into a
// rendered node's DOM/props) - a plain lookup kept in sync by hand, same as
// those files' own action lists; all three are short and change together.
// Returns individual keys (not a joined string) so the indicator below can
// render each one bold/accented with only the separators dimmed, rather than
// the whole legend at one flat, easy-to-miss opacity.
const legendKeysFor = (isStart: boolean, isFrame: boolean, removable: boolean): string[] => {
  if (isStart) return ['i'];
  // No 'g' - group isn't offered for a checkpoint's own sealed output (see
  // FrameNode.tsx's doc comment). 'x' here cancels the container itself
  // (CanvasStore.deleteCheckpoint), not a per-table removal.
  if (isFrame) return ['s', 'w', 'o', 'p', '+', 'i', 'x'];
  return ['s', 'w', 'o', 'g', 'p', '+', 'i', ...(removable ? ['x'] : [])];
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
        fontSize: 'calc(12px * var(--text-scale, 1))',
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
          width: 7,
          height: 7,
          background: insert ? 'var(--canvas-trace)' : 'var(--canvas-text-dim)',
        }}
      />
      <span>{insert ? 'insert' : 'normal'}</span>
      {!insert && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span aria-hidden style={{ opacity: 0.5 }}>
            ·
          </span>
          {legendKeysFor(isStart, isFrame, removable).map((key, i) => (
            <React.Fragment key={key}>
              {i > 0 && (
                <span aria-hidden style={{ opacity: 0.35 }}>
                  ·
                </span>
              )}
              {/* Full opacity + the trace accent, not the dimmed status text
                  around it - these are live keyboard shortcuts, not part of
                  the mode readout, so they're the one thing here that should
                  actually catch the eye at rest. */}
              <span style={{ color: 'var(--canvas-trace)' }}>{key}</span>
            </React.Fragment>
          ))}
        </span>
      )}
    </div>
  );
});

export default CanvasToolbar;
