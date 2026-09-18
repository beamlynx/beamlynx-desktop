import { useState } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { Session as SessionType } from '../store/session';
import { useStores } from '../store/store-container';

/**
 * Shown at the top of a tab RevealRequestHandler.tsx opened for an MCP
 * agent's request_reveal call (see Session.pendingRevealRequestId). This tab
 * is an ordinary Pine session underneath -- the owner can edit the
 * expression in the editor above and re-run it exactly as they would any
 * other query, before deciding:
 *  - Reveal: sends this tab's current expression/columns/rows back to the
 *    agent, whatever they are right now (edited or not).
 *  - Decline: sends an optional comment instead, and runs nothing.
 * Either way ends review for this request -- clear() removes the pinned tab
 * entirely (finishRevealSession), since it only ever existed for this one
 * request; there's nothing to hand back to the user as an ordinary tab.
 */
const RevealRequestBanner = observer(({ session }: { session: SessionType }) => {
  const { global } = useStores();
  const [declining, setDeclining] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const requestId = session.pendingRevealRequestId;
  if (!requestId) return null;

  const clear = () => global.finishRevealSession(session.id);

  const handleReveal = async () => {
    setBusy(true);
    try {
      // session.rows/session.columns are the DataGrid-shaped fields
      // (header-stripped row objects, GridColDef metadata) -- not the raw
      // pine-lang eval response shape check_reveal's formatRows (beamlynx-
      // desktop) needs, which expects the header as row 0 of an array of
      // arrays. session.evaluate()'s own return value IS that raw shape
      // (see plugin/default.plugin.tsx -- it returns response.result
      // before any of the DataGrid transforms run), so this re-runs
      // whatever expression is currently in the editor (edited or not) and
      // reveals exactly what that run returns, rather than reading
      // already-transformed grid state back out.
      const rawRows = await session.evaluate({ applyServerPrettified: true });
      if (session.error) {
        setBusy(false);
        return;
      }
      await global.resolveRevealRequest(requestId, {
        ok: true,
        expression: session.expression,
        columns: session.columns,
        rows: rawRows,
      });
      // No finally/setBusy(false) after this: clear() removes the pinned
      // tab (finishRevealSession), unmounting this component -- a state
      // update past that point has nothing left to update.
      clear();
    } catch (e) {
      setBusy(false);
      throw e;
    }
  };

  const handleDecline = async () => {
    setBusy(true);
    try {
      await global.resolveRevealRequest(requestId, { ok: false, comment: comment.trim() || undefined });
      // See handleReveal's own comment -- clear() unmounts this component.
      clear();
    } catch (e) {
      setBusy(false);
      throw e;
    }
  };

  const connectionLabel = global.getConnectionLabel(session.connectionId);

  return (
    <Box
      sx={{
        px: 2,
        py: 1,
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--canvas-chip-bg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
      }}
    >
      <Typography variant="body2">
        An agent wants to see this query&apos;s real results on <strong>{connectionLabel}</strong>. Your access
        policy is hiding them -- edit the expression above if you&apos;d like, then decide below.
      </Typography>

      {session.revealReason && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 0.75,
            pl: 1.5,
            // Amber, matching the pinned tab's own "needs your attention"
            // icon color (--notification-color) -- this is the agent's own
            // words set apart from our explanatory text, not a second
            // system message, so it reads as quoted rather than blended
            // into the paragraph above.
            borderLeft: '3px solid var(--notification-color)',
          }}
        >
          <Typography variant="caption" sx={{ color: 'var(--canvas-text-dim)', flexShrink: 0 }}>
            Agent&apos;s reason:
          </Typography>
          <Typography variant="body2">{session.revealReason}</Typography>
        </Box>
      )}

      {declining ? (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder="Why declining? Optional, but it helps the agent adjust and retry."
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
          <Button size="small" color="error" variant="contained" disabled={busy} onClick={handleDecline}>
            Send decline
          </Button>
          <Button size="small" disabled={busy} onClick={() => setDeclining(false)}>
            Cancel
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" variant="contained" disabled={busy} onClick={handleReveal}>
            Approve
          </Button>
          <Button size="small" color="error" disabled={busy} onClick={() => setDeclining(true)}>
            Decline...
          </Button>
        </Box>
      )}
    </Box>
  );
});

export default RevealRequestBanner;
