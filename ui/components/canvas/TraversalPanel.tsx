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

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  color: 'var(--canvas-danger, #c66)',
  borderColor: 'var(--canvas-danger, #c66)',
};

const disabledButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  cursor: 'not-allowed',
  color: 'var(--canvas-text-dim)',
  borderColor: 'var(--canvas-chip-border)',
  opacity: 0.6,
};

const TraversalPanel = observer(({ canvasStore }: { canvasStore: CanvasStore }) => {
  const traversal = canvasStore.traversal;
  if (!traversal) return null;

  const { verb, status, nodes, depthCapped, script, error, run, outcomes } = traversal;
  const total = nodes.reduce((sum, n) => sum + n.count, 0);
  const walking = status === 'walking';
  const canRun = canvasStore.canRunDelete;
  const connection = canvasStore.connectionLabel;
  const deleted = outcomes.reduce((sum, o) => sum + ('deleted' in o ? o.deleted : 0), 0);
  const failure = outcomes.find(o => 'error' in o);

  return (
    <div style={{ ...panelStyle, position: 'absolute' }} data-testid="traversal-panel">
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

      {/* The confirmation. The flag above catches the wrong database, decided
          once per connection; this catches the wrong query, which you only
          notice with the numbers in front of you -- so it names the
          connection AND lists what is about to go. */}
      {run === 'confirming' && (
        <div
          data-testid="traversal-confirm"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--canvas-node-bg)',
            display: 'flex',
            flexDirection: 'column',
            padding: 12,
            gap: 8,
            zIndex: 1,
          }}
        >
          <div style={{ fontWeight: 600 }}>Delete {total} rows?</div>
          <div style={{ color: 'var(--canvas-text-dim)' }}>
            On <strong>{connection}</strong>. This cannot be undone.
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {nodes.map(node => (
              <div
                key={`confirm-${node.id}-${node.depth}`}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}
              >
                <span>{node.table}</span>
                <span style={{ color: 'var(--canvas-text-dim)' }}>{node.count}</span>
              </div>
            ))}
          </div>
          {/* Stated, not buried: the run is per table, not one transaction. */}
          <div style={{ color: 'var(--canvas-text-dim)' }}>
            Each table is deleted in turn, deepest first. If one fails the rest are left alone —
            nothing is rolled back, and re-running finishes the job.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={buttonStyle} onClick={() => canvasStore.dismissTraversalRun()}>
              Cancel
            </button>
            <button
              style={dangerButtonStyle}
              data-testid="traversal-confirm-run"
              onClick={() => void canvasStore.confirmTraversalRun()}
            >
              Delete {total} rows
            </button>
          </div>
        </div>
      )}

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
                  it stops here unless you go further on purpose. */}
              {run === 'idle' && 'Nothing has been deleted.'}
              {run === 'running' && `Deleting… ${outcomes.length}/${nodes.length}`}
              {run === 'finished' &&
                (failure
                  ? `Stopped after ${outcomes.length - 1} of ${nodes.length}. Nothing below is deleted; re-run to finish.`
                  : `Deleted ${deleted} ${deleted === 1 ? 'row' : 'rows'}.`)}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                style={buttonStyle}
                data-testid="traversal-copy"
                onClick={() => void navigator.clipboard?.writeText(script)}
              >
                Copy
              </button>
              {run !== 'finished' && (
                <button
                  style={canRun ? dangerButtonStyle : disabledButtonStyle}
                  data-testid="traversal-run"
                  disabled={!canRun || run === 'running'}
                  title={
                    canRun
                      ? undefined
                      : 'Turn on "Allow destructive actions" for this connection in Settings → Connections. Off by default, and unavailable for a connection you have not saved.'
                  }
                  onClick={() => canvasStore.requestTraversalRun()}
                >
                  {run === 'running' ? 'Running…' : 'Run'}
                </button>
              )}
            </div>
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
