import React from 'react';
import { observer } from 'mobx-react-lite';
import { CanvasStore } from '../../store/canvas/canvas.store';

// The output of a traversal: one row per table the walk reached, and for the
// delete verb the script it would run.
//
// A panel of its own rather than the results grid, which is built for one
// result set. A traversal produces a list that grows while it runs, in an
// order that matters (children before parents), where each row is a table
// rather than a record. It also rules out flipping session.mode to 'graph' to
// borrow the SQL pane the way the routine this replaces did -- that was a
// workaround for having nowhere to put the script, and it took the canvas off
// screen at the moment you most want to see which tables were found.

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  bottom: 12,
  width: 380,
  maxWidth: 'calc(100% - 24px)',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--canvas-node-bg)',
  border: '1px solid var(--canvas-node-border)',
  borderRadius: 4,
  fontFamily: 'var(--canvas-font)',
  fontSize: 'calc(12px * var(--text-scale, 1))',
  color: 'var(--canvas-text)',
  zIndex: 6,
  overflow: 'hidden',
};

const buttonStyle: React.CSSProperties = {
  fontSize: 'calc(12px * var(--text-scale, 1))',
  fontFamily: 'var(--canvas-font)',
  padding: '3px 9px',
  borderRadius: 3,
  cursor: 'pointer',
  color: 'var(--canvas-trace)',
  border: '1px solid var(--canvas-trace)',
  background: 'transparent',
  whiteSpace: 'nowrap',
};

const TraversalPanel = observer(({ canvasStore }: { canvasStore: CanvasStore }) => {
  const traversal = canvasStore.traversal;
  if (!traversal) return null;

  const { verb, status, nodes, depthCapped, script, error } = traversal;
  const total = nodes.reduce((sum, n) => sum + n.count, 0);
  const walking = status === 'walking';

  return (
    <div style={panelStyle} data-testid="traversal-panel">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          borderBottom: '1px solid var(--canvas-node-border)',
        }}
      >
        <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          {verb === 'count' ? 'Count rows' : 'Delete rows'}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {walking && (
            <button
              style={buttonStyle}
              onClick={() => canvasStore.cancelTraversal()}
              data-testid="traversal-cancel"
            >
              Cancel
            </button>
          )}
          <button
            style={{ ...buttonStyle, color: 'var(--canvas-text-dim)', border: 'none' }}
            onClick={() => canvasStore.closeTraversal()}
            data-testid="traversal-close"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div style={{ padding: '6px 10px', color: 'var(--canvas-text-dim)' }}>
        {walking && `Walking related tables… ${nodes.length} so far`}
        {status === 'done' &&
          `${nodes.length} ${nodes.length === 1 ? 'table' : 'tables'}, ${total} ${total === 1 ? 'row' : 'rows'}`}
        {status === 'cancelled' && 'Cancelled. Showing what was found before stopping.'}
        {status === 'failed' && (
          <span style={{ color: 'var(--canvas-danger, #c66)' }}>{error}</span>
        )}
      </div>

      {/* Reaching the cap is stated, never silent: a truncated tree shown as
          a complete one is the one outcome worth avoiding here. */}
      {depthCapped && (
        <div style={{ padding: '0 10px 6px', color: 'var(--canvas-text-dim)' }}>
          Stopped at the depth limit — there may be more tables below these.
        </div>
      )}

      <div
        style={{
          overflowY: 'auto',
          flex: script ? '0 0 auto' : 1,
          maxHeight: script ? '45%' : undefined,
        }}
      >
        {nodes.map(node => (
          <div
            key={`${node.id}-${node.depth}`}
            data-testid={`traversal-node-${node.table}`}
            onClick={() => canvasStore.openTraversalNode(node)}
            title={node.expression}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              padding: '3px 10px',
              cursor: 'pointer',
            }}
          >
            {/* Indented by depth so the shape of the tree is visible, and
                ordered children-before-parents, which is the order the
                DELETEs have to run in. */}
            <span
              style={{ paddingLeft: node.depth * 12, overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {node.table}
            </span>
            <span style={{ color: 'var(--canvas-text-dim)' }}>{node.count}</span>
          </div>
        ))}
      </div>

      {script && (
        <>
          <div
            style={{
              padding: '6px 10px',
              borderTop: '1px solid var(--canvas-node-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span style={{ color: 'var(--canvas-text-dim)' }}>
              {/* Said plainly, because the whole point of this verb is that
                  it stops here. */}
              Nothing has been deleted.
            </span>
            <button
              style={buttonStyle}
              data-testid="traversal-copy"
              onClick={() => void navigator.clipboard?.writeText(script)}
            >
              Copy
            </button>
          </div>
          <pre
            data-testid="traversal-script"
            style={{
              flex: 1,
              margin: 0,
              padding: '8px 10px',
              overflow: 'auto',
              fontFamily: 'var(--code-font)',
              fontSize: 'calc(11px * var(--text-scale, 1))',
              color: 'var(--canvas-text-dim)',
              whiteSpace: 'pre',
            }}
          >
            {script}
          </pre>
        </>
      )}
    </div>
  );
});

export default TraversalPanel;
