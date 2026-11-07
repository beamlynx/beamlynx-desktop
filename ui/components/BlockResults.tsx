import { Box } from '@mui/material';
import { observer } from 'mobx-react-lite';
import type { BlockRun, Session } from '../store/session';
import ErrorMessage from './ErrorMessage';
import Result from './Result';

/** A block's first line, as a section's title: a leading comment's words, or
 * the start of the query. */
export function blockTitle(text: string): string {
  const first = text.split('\n').find(l => l.trim()) ?? '';
  return first
    .replace(/^\s*(--|\/\*+)\s*/, '')
    .replace(/\s*\*\/\s*$/, '')
    .trim();
}

function status(run: BlockRun, stopped: boolean): string {
  const s = run.session;
  if (run.state === 'skipped') return stopped ? 'Not run, stopped' : 'Not run, a block above failed';
  if (run.state === 'waiting') return 'Waiting';
  if (run.state === 'running') return 'Running…';
  if (s.error) return s.evalErrorType === 'cancelled' ? 'Stopped' : 'Failed';
  // The grid's own footer gives the rows and time.
  return '';
}

// Tall enough for a few rows and the grid's footer, and no taller than the
// rows need, so short results don't leave a gap before the next section.
const ROW_PX = 30;
const CHROME_PX = 92;
const MIN_PX = 150;
const MAX_PX = 380;

/**
 * The results of a Run that ran several blocks: a section for each, top to
 * bottom in the order they ran. Each is the ordinary results grid, showing
 * that block's own session, so cells edit the way they do in any tab.
 */
const BlockResults = observer(({ sessionId, session }: { sessionId: string; session: Session }) => {
  const stopped = session.blockRuns.some(r => r.session.evalErrorType === 'cancelled');
  return (
    <Box sx={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', p: '8px 0' }}>
      {session.blockRuns.map(run => {
        const ran = run.state === 'done' && !run.session.error;
        const height = Math.min(MAX_PX, Math.max(MIN_PX, run.session.rows.length * ROW_PX + CHROME_PX));
        return (
          <Box key={run.index} component="section" aria-label={`Block ${run.index + 1}`} sx={{ flexShrink: 0 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '12px',
                px: '10px',
                pb: '6px',
                fontFamily: 'var(--canvas-font)',
                fontSize: 'calc(12px * var(--text-scale, 1))',
                borderBottom: '1px solid var(--canvas-node-border)',
              }}
            >
              <Box
                component="span"
                title={run.text}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--code-font)',
                  color: 'var(--canvas-text)',
                }}
              >
                {blockTitle(run.text)}
              </Box>
              <Box
                component="span"
                sx={{
                  flexShrink: 1,
                  maxWidth: '50%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: run.session.error && run.state === 'done' ? 'var(--error-color, #c62828)' : 'var(--canvas-text-dim)',
                }}
              >
                {status(run, stopped)}
              </Box>
            </Box>
            <ErrorMessage sessionId={sessionId} session={run.session} />
            {ran && (
              <Box sx={{ height, position: 'relative' }}>
                <Result sessionId={sessionId} session={run.session} />
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
});

export default BlockResults;
