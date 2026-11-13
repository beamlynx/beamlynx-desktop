import React from 'react';
import { observer } from 'mobx-react-lite';
import { CanvasStore } from '../../store/canvas/canvas.store';
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

/**
 * A drawing's title block: the ruled box in the corner of an engineering
 * sheet carrying what the drawing is of. Reads as "the comment about this
 * query" in the same schematic vocabulary the rest of the canvas speaks,
 * rather than importing a speech-bubble or sticky-note glyph from a
 * commenting system this isn't one of.
 */
const TitleBlock = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
    <rect x="2" y="3" width="12" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path d="M4.5 6.5 H11.5 M4.5 9 H9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

/**
 * Refresh: a circular arrow, the glyph people know for "start over". The
 * one curved icon here; a squared loop read as "share" instead.
 */
const ResetLayout = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M13.5 8 A5.5 5.5 0 1 1 11.9 4.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M12.6 1.4 V4.6 H9.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
  <span
    aria-hidden
    style={{ color: 'var(--canvas-node-border)', fontSize: 'calc(9px * var(--text-scale, 1))' }}
  >
    |
  </span>
);

/** An extra icon appended to the toolbar, past a divider, after undo/redo -
 * currently only ever the orientation toggle NewLayoutView's canvas pane
 * supplies. Optional rather than baked into CanvasToolbar directly since
 * this widget doesn't otherwise know anything about the layout around it. */
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
 * Auto-run lives here (not on a Run button) so its state is always visible
 * on the canvas itself - the floating Run button (Input.tsx's RunButton, see
 * NewLayoutView.tsx's LeftPane) only shows up when the Pine/SQL panel is
 * closed, so it isn't a reliable place to show this.
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
          title="Undo last graph action (u)"
          style={canvasStore.canUndo ? iconButtonStyle : disabledIconButtonStyle}
          onClick={() => canvasStore.canUndo && canvasStore.undo()}
        >
          <CornerArrow />
        </span>
        <Divider />
        <span
          title="Redo (Shift+U)"
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
        <Divider />
        <span
          title={
            canvasStore.session.doc
              ? 'Edit this comment (n)'
              : 'Add a comment saying what this query is for (n)'
          }
          style={{
            ...iconButtonStyle,
            color:
              canvasStore.session.doc || canvasStore.docEditing
                ? 'var(--canvas-trace)'
                : 'var(--canvas-text-dim)',
          }}
          onClick={() =>
            canvasStore.docEditing ? canvasStore.cancelDocEdit() : canvasStore.startDocEdit()
          }
        >
          <TitleBlock />
        </span>
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
        {extraAction && (
          <>
            <Divider />
            <span title={extraAction.tooltip} style={iconButtonStyle} onClick={extraAction.onClick}>
              {extraAction.icon}
            </span>
          </>
        )}
        {/* Rightmost: it only appears once a node has moved, so it
            doesn't shift the other buttons along. */}
        {canvasStore.hasMovedNodes && (
          <>
            <Divider />
            <span
              data-testid="canvas-reset-layout"
              title="Reset the layout: put moved nodes back"
              style={iconButtonStyle}
              onClick={() => canvasStore.resetLayout()}
            >
              <ResetLayout />
            </span>
          </>
        )}
      </div>
    );
  });

export default CanvasToolbar;
