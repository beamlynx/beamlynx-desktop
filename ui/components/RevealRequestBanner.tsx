import { useState } from 'react';
import { Box, Button, TextField, Tooltip, Typography } from '@mui/material';
import { VisibilityOutlined } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { Session as SessionType } from '../store/session';
import { useStores } from '../store/store-container';

/**
 * Shown at the top of a tab RevealRequestHandler.tsx opened for an MCP
 * agent's request_reveal call (see Session.pendingRevealRequestId). This tab
 * is an ordinary Pine session underneath -- the owner can edit the
 * expression in the editor below and re-run it exactly as they would any
 * other query, before deciding:
 *  - Approve: sends this tab's current expression/columns/rows back to the
 *    agent, whatever they are right now (edited or not).
 *  - Decline: sends an optional comment instead, and runs nothing.
 * Either way ends review for this request -- clear() removes the pinned tab
 * entirely (finishRevealSession), since it only ever existed for this one
 * request; there's nothing to hand back to the user as an ordinary tab.
 *
 * One row, not a block of prose: the only thing here the owner can't work
 * out from context is the agent's own reason, so that's the only thing
 * spelled out. What a reveal request even IS lives in the icon's tooltip --
 * needed once, by someone seeing their first one, not on every subsequent
 * request forever.
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
  const connectionColor = global.getConnectionColor(session.connectionId);
  const connectionIsLive = global.isConnectionLive(session.connectionId);

  return (
    <Box
      sx={{
        px: 2,
        py: 0.75,
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--canvas-chip-bg)',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
      }}
    >
      {/* The same icon the pinned tab uses, carrying the same meaning, and
          the only place the full explanation still lives. */}
      <Tooltip title="An agent wants to see this query's real results, which your access policy is hiding. Edit the expression below if you'd like, then approve or decline.">
        <VisibilityOutlined
          sx={{ fontSize: 16, flexShrink: 0, color: 'var(--notification-color)' }}
        />
      </Tooltip>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
        <Box
          component="span"
          title={connectionIsLive ? undefined : 'Assigned but not connected yet'}
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            flexShrink: 0,
            boxSizing: 'border-box',
            backgroundColor: connectionIsLive ? connectionColor : 'transparent',
            border: connectionIsLive ? 'none' : `1.5px solid ${connectionColor || 'var(--canvas-node-border)'}`,
          }}
        />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {connectionLabel}
        </Typography>
      </Box>

      {declining ? (
        <>
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder="Why declining? Optional, but it helps the agent adjust and retry."
            value={comment}
            onChange={e => setComment(e.target.value)}
            // Enter sends it, Escape backs out -- this field is the only
            // thing focused once Decline... is clicked, so reaching for the
            // mouse to finish a sentence you just typed is pure friction.
            // stopPropagation as well as preventDefault: Escape is also a
            // global keybinding (Zen mode / canvas gestures), and the
            // keydown would otherwise keep bubbling after this handles it.
            onKeyDown={event => {
              if (event.key === 'Enter' && !busy) {
                event.preventDefault();
                event.stopPropagation();
                void handleDecline();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setDeclining(false);
              }
            }}
            sx={{ flex: 1, minWidth: 0 }}
          />
          <Button size="small" color="error" disabled={busy} onClick={handleDecline}>
            Decline
          </Button>
          <Button size="small" disabled={busy} onClick={() => setDeclining(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <Typography
            variant="body2"
            sx={{
              flex: 1,
              minWidth: 0,
              color: session.revealReason ? 'var(--text-color)' : 'var(--canvas-text-dim)',
            }}
          >
            {session.revealReason ? `“${session.revealReason}”` : 'No reason given.'}
          </Typography>
          <Button size="small" variant="contained" disabled={busy} onClick={handleReveal}>
            Approve
          </Button>
          <Button size="small" color="error" disabled={busy} onClick={() => setDeclining(true)}>
            Decline...
          </Button>
        </>
      )}
    </Box>
  );
});

export default RevealRequestBanner;
