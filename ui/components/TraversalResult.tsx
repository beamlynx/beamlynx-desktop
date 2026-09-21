import React from 'react';
import { observer } from 'mobx-react-lite';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { ContentCopy } from '@mui/icons-material';
import { Session } from '../store/session';
import { themedScrollbarSx } from '../utils/scrollbar';

// A traversal, rendered where results are rendered.
//
// Counting the tables under one of yours answers a question about the data,
// the same way a query does -- it just wants a tree rather than a grid. So it
// belongs in the results pane, not in a panel floating over the canvas. Result
// .tsx already held the idea that one result can be drawn more than one way
// (its bar-chart view); this is the same idea with a third shape, and it is
// why Session.traversal sits next to Session.rows.

const rowSx = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 1,
  px: 1.5,
  py: 0.25,
  fontSize: 'calc(13px * var(--text-scale, 1))',
};

/**
 * Matches the results grid's own copy control (Result.tsx): the same
 * ContentCopy icon button, and the same feedback -- a message on the session,
 * through GlobalStore.setCopiedMessage, rather than a label that changes on
 * the button itself. Copying is copying wherever you are in the results pane,
 * so it should not look or behave like two different features.
 */
const TraversalResult: React.FC<{ session: Session }> = observer(({ session }) => {
  const traversal = session.traversal;
  if (!traversal) return null;

  const { verb, status, nodes, depthCapped, script, error, run, outcomes, runFrom } = traversal;
  const copyScript = async () => {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script);
      session.globalStore?.setCopiedMessage?.(
        session.id,
        `${nodes.length} ${nodes.length === 1 ? 'query' : 'queries'}`,
      );
    } catch {
      // Clipboard denied (no permission, or an insecure context). Say nothing
      // rather than claim a copy that did not happen.
    }
  };
  const total = nodes.reduce((sum, n) => sum + n.count, 0);
  const walking = status === 'walking';
  const deleted = outcomes.reduce((sum, o) => sum + ('deleted' in o ? o.deleted : 0), 0);
  const failure = outcomes.find(o => 'error' in o);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          px: 1.5,
          py: 1,
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <Typography sx={{ fontWeight: 600, fontSize: 'calc(13px * var(--text-scale, 1))' }}>
          {verb === 'count' ? 'Count rows' : 'Delete rows'}
          <Box component="span" sx={{ color: 'var(--canvas-text-dim)', ml: 1, fontWeight: 400 }}>
            {walking && `walking… ${nodes.length} so far`}
            {status === 'done' &&
              `${nodes.length} ${nodes.length === 1 ? 'table' : 'tables'}, ${total} ${
                total === 1 ? 'row' : 'rows'
              }`}
            {status === 'cancelled' && 'cancelled — showing what was found'}
          </Box>
        </Typography>
        {walking && (
          <Button
            size="small"
            onClick={() => session.cancelTraversal()}
            data-testid="traversal-cancel"
          >
            Cancel
          </Button>
        )}
      </Box>

      {status === 'failed' && (
        <Box sx={{ px: 1.5, py: 1, color: 'var(--error-color, #c66)' }}>{error}</Box>
      )}

      {/* Reaching the cap is stated, never silent: a truncated tree shown as a
          complete one is the one outcome worth avoiding here. */}
      {depthCapped && (
        <Box sx={{ px: 1.5, py: 0.5, color: 'var(--canvas-text-dim)' }}>
          Stopped at the depth limit — there may be more tables below these.
        </Box>
      )}

      <Box sx={{ overflowY: 'auto', flex: script ? '0 0 45%' : 1, ...themedScrollbarSx }}>
        {nodes.map(node => (
          <Box
            key={`${node.id}-${node.depth}`}
            data-testid={`traversal-node-${node.table}`}
            onClick={() => session.openTraversalNode(node)}
            title={node.expression}
            sx={{ ...rowSx, cursor: 'pointer', '&:hover': { background: 'var(--hover-color)' } }}
          >
            {/* Indented by depth so the shape of the tree is visible, and in
                children-before-parents order, which is the order the DELETEs
                have to run in. */}
            <Box component="span" sx={{ pl: `${node.depth * 12}px` }}>
              {node.table}
            </Box>
            <Box component="span" sx={{ color: 'var(--canvas-text-dim)' }}>
              {node.count}
            </Box>
          </Box>
        ))}
      </Box>

      {script && (
        <>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              px: 1.5,
              py: 1,
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <Box component="span" sx={{ color: 'var(--canvas-text-dim)' }}>
              {/* Said plainly, because the whole point of this verb is that it
                  stops here unless you go further on purpose. */}
              {run === 'idle' && (session.runDeleteBlockedReason ?? 'Nothing has been deleted.')}
              {run === 'running' && `Deleting… ${runFrom}/${nodes.length}`}
              {run === 'paused' &&
                `Paused after ${runFrom} of ${nodes.length}. Resume picks up where it stopped.`}
              {run === 'failed' &&
                `Stopped at ${nodes[runFrom]?.table ?? 'a table'}, ${runFrom} of ${nodes.length} done. ${
                  failure && 'error' in failure ? failure.error : ''
                } Resume retries that table — the ones already done are not repeated.`}
              {run === 'finished' && `Deleted ${deleted} ${deleted === 1 ? 'row' : 'rows'}.`}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title="Copy the delete queries">
                <IconButton
                  size="small"
                  data-testid="traversal-copy"
                  aria-label="Copy the delete queries"
                  onClick={() => void copyScript()}
                  sx={{
                    borderRadius: '4px',
                    backgroundColor: 'var(--canvas-node-bg)',
                    border: '1px solid var(--canvas-node-border)',
                    color: 'var(--canvas-trace)',
                    '&:hover': { backgroundColor: 'var(--canvas-chip-bg)' },
                  }}
                >
                  <ContentCopy fontSize="small" />
                </IconButton>
              </Tooltip>
              {run === 'running' && (
                <Button
                  size="small"
                  data-testid="traversal-pause"
                  onClick={() => session.pauseTraversalRun()}
                >
                  Pause
                </Button>
              )}
              {run !== 'finished' && run !== 'running' && (
                <Button
                  size="small"
                  color="error"
                  data-testid="traversal-run"
                  disabled={!session.canRunDelete}
                  title={session.runDeleteBlockedReason ?? undefined}
                  // Resuming skips the confirmation: it was given for this
                  // exact set of tables, and only how far through them we are
                  // has changed.
                  onClick={() =>
                    run === 'paused' || run === 'failed'
                      ? void session.confirmTraversalRun()
                      : session.requestTraversalRun()
                  }
                >
                  {run === 'paused' || run === 'failed' ? 'Resume' : 'Run'}
                </Button>
              )}
            </Box>
          </Box>
          <Box
            component="pre"
            data-testid="traversal-script"
            sx={{
              flex: 1,
              m: 0,
              px: 1.5,
              py: 1,
              overflow: 'auto',
              fontFamily: 'var(--code-font)',
              fontSize: 'calc(12px * var(--text-scale, 1))',
              color: 'var(--canvas-text-dim)',
              whiteSpace: 'pre',
              ...themedScrollbarSx,
            }}
          >
            {script}
          </Box>
        </>
      )}

      {/* The confirmation. The connection flag catches the wrong database,
          decided once per connection; this catches the wrong query, which you
          only notice with the numbers in front of you -- so it names the
          connection AND lists what is about to go. */}
      {run === 'confirming' && (
        <Box
          data-testid="traversal-confirm"
          sx={{
            position: 'absolute',
            inset: 0,
            background: 'var(--background-color)',
            display: 'flex',
            flexDirection: 'column',
            p: 2,
            gap: 1,
          }}
        >
          <Typography sx={{ fontWeight: 600 }}>Delete {total} rows?</Typography>
          <Box sx={{ color: 'var(--canvas-text-dim)' }}>
            On <strong>{session.traversalConnectionLabel}</strong>. This cannot be undone.
          </Box>
          <Box sx={{ overflowY: 'auto', flex: 1, ...themedScrollbarSx }}>
            {nodes.map(node => (
              <Box key={`confirm-${node.id}-${node.depth}`} sx={rowSx}>
                <span>{node.table}</span>
                <Box component="span" sx={{ color: 'var(--canvas-text-dim)' }}>
                  {node.count}
                </Box>
              </Box>
            ))}
          </Box>
          {/* Stated, not buried: the run is per table, not one transaction. */}
          <Box sx={{ color: 'var(--canvas-text-dim)' }}>
            Each table is deleted in turn, deepest first. If one fails the rest are left alone —
            nothing is rolled back, and re-running finishes the job.
          </Box>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button size="small" onClick={() => session.dismissTraversalRun()}>
              Cancel
            </Button>
            <Button
              size="small"
              color="error"
              variant="outlined"
              data-testid="traversal-confirm-run"
              onClick={() => void session.confirmTraversalRun()}
            >
              Delete {total} rows
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
});

export default TraversalResult;
