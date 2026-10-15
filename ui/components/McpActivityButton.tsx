import React, { useRef, useState } from 'react';
import { IconButton, Box, Badge, Popover, ButtonBase, CircularProgress } from '@mui/material';
import { SmartToyOutlined, CheckCircleOutline, ErrorOutline, HourglassEmpty } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import type { AgentActivityEntry } from '../store/agent-activity';

/**
 * The one header affordance for everything the agent is doing -- both the
 * MCP activity tab and any pending reveal requests (see PineTabs.tsx, which
 * pins a tab for each). Deliberately ONE icon rather than one per concept:
 * an eye on its own in a header row says nothing, where a robot carrying a
 * count reads immediately as "the agent wants two things", and a third agent
 * concept later needs no third icon.
 *
 * Only rendered once there's actually something -- the agent's first call
 * of any kind, not just its first query -- since an always-on icon for a
 * feature most sessions never touch would just be clutter next to the
 * bell/gear.
 *
 * While the agent is working the robot pulses, in the accent colour, and
 * its tooltip says what it is doing. Working includes the pauses between
 * calls, while the agent thinks (AgentActivityStore's LINGER_MS). Clicking it opens the activity log:
 * every call, newest first, each opening to show what the agent sent and
 * how it went, with buttons to the agent's tab and any pending approval.
 *
 * The two states it distinguishes are deliberately weighted differently:
 * a count badge for pending approvals, which are blocking an agent and need
 * a decision, and the same amber the bell uses for unseen activity, which is
 * only ever "a result landed while you were looking elsewhere".
 */
const time = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const duration = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

// The pulse while the agent works: the robot breathes rather than spins, so
// it reads as "busy" without pulling the eye the way a spinner does.
const pulse = {
  animation: 'pine-agent-pulse 1.4s ease-in-out infinite',
  '@keyframes pine-agent-pulse': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.35 },
  },
};

const StatusIcon = observer(({ entry }: { entry: AgentActivityEntry }) => {
  const { global } = useStores();
  const sx = { fontSize: 14, flexShrink: 0 };
  if (entry.endedAt === undefined && !global.agentActivity.isStale(entry)) {
    return entry.tool === 'check_reveal' ? (
      <HourglassEmpty sx={{ ...sx, color: 'var(--notification-color)' }} />
    ) : (
      <CircularProgress size={11} thickness={6} sx={{ color: 'var(--canvas-trace)', flexShrink: 0, mx: '1.5px' }} />
    );
  }
  if (entry.ok === false || global.agentActivity.isStale(entry)) {
    return <ErrorOutline sx={{ ...sx, color: 'var(--canvas-trace-unresolved)' }} />;
  }
  return <CheckCircleOutline sx={{ ...sx, color: 'var(--canvas-text-dim)' }} />;
});

// One call: what the agent did, when, and how long it took. Click it to
// see what it sent and how it went.
const ActivityRow = observer(({ entry }: { entry: AgentActivityEntry }) => {
  const { global } = useStores();
  const [open, setOpen] = useState(false);
  const stale = global.agentActivity.isStale(entry);
  const took =
    entry.endedAt !== undefined && entry.endedAt > entry.startedAt ? duration(entry.endedAt - entry.startedAt) : null;
  const outcome = stale ? 'No answer came back for this call.' : entry.outcome;
  const more = Boolean(entry.detail || outcome);
  return (
    <Box sx={{ borderBottom: '1px solid var(--border-color)' }}>
      <ButtonBase
        onClick={() => more && setOpen(o => !o)}
        disabled={!more}
        sx={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          textAlign: 'left',
          justifyContent: 'flex-start',
          '&:hover': { backgroundColor: more ? 'var(--canvas-chip-bg)' : undefined },
        }}
      >
        <StatusIcon entry={entry} />
        <Box component="span" sx={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: 'var(--text-color)' }}>
          {entry.summary}
        </Box>
        <Box
          component="span"
          sx={{ flexShrink: 0, fontSize: '0.7rem', color: 'var(--canvas-text-dim)', fontVariantNumeric: 'tabular-nums' }}
        >
          {took ? `${took} · ` : ''}
          {time(entry.startedAt)}
        </Box>
      </ButtonBase>
      {open && (
        <Box sx={{ px: 1.5, pb: 1, pl: 4.25 }}>
          {entry.detail && (
            <Box
              component="pre"
              sx={{
                m: 0,
                mb: outcome ? 0.75 : 0,
                p: 1,
                maxHeight: 180,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'var(--code-font, monospace)',
                fontSize: '0.72rem',
                borderRadius: 1,
                backgroundColor: 'var(--canvas-chip-bg)',
                color: 'var(--text-color)',
              }}
            >
              {entry.detail}
            </Box>
          )}
          {outcome && (
            <Box
              sx={{
                fontSize: '0.75rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: entry.ok === false || stale ? 'var(--canvas-trace-unresolved)' : 'var(--canvas-text-dim)',
              }}
            >
              {outcome}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
});

const footerButton = {
  fontSize: '0.78rem',
  px: 1.25,
  py: 0.5,
  borderRadius: 1,
  color: 'var(--canvas-trace)',
  '&:hover': { backgroundColor: 'var(--canvas-chip-bg)' },
};

const McpActivityButton = observer(() => {
  const { global } = useStores();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const activity = global.agentActivity;
  const pendingApprovals = global.pendingRevealSessionIds.length;

  if (!global.mcpSessionId && pendingApprovals === 0 && activity.entries.length === 0) return null;

  const needsDecision = pendingApprovals > 0;
  const highlight = needsDecision || global.mcpHasUnseenActivity;
  const working = activity.working;
  const current = activity.current;

  return (
    <Box sx={{ ml: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <IconButton
        ref={anchor}
        onClick={() => setOpen(true)}
        color="inherit"
        title={working ? (current ? `Agent: ${current.summary}` : 'Agent: working') : undefined}
        aria-label={
          needsDecision
            ? `Agent (${pendingApprovals} waiting for your approval)`
            : working
              ? 'Agent activity (working)'
              : global.mcpHasUnseenActivity
                ? 'Agent activity (new results)'
                : 'Agent activity'
        }
      >
        <Badge
          badgeContent={pendingApprovals}
          sx={{
            // --background-color as the badge's own text is what makes this
            // legible in all three themes without a per-theme override:
            // each theme's notification amber is already tuned to stand out
            // against that theme's background, so using one as the other's
            // text inverts cleanly (dark text on light gold in dark mode,
            // cream on dark gold in light/sepia).
            '& .MuiBadge-badge': {
              backgroundColor: 'var(--notification-color)',
              color: 'var(--background-color)',
              fontSize: '0.625rem',
              fontWeight: 600,
              height: 16,
              minWidth: 16,
            },
          }}
        >
          <SmartToyOutlined
            sx={{
              color: working ? 'var(--canvas-trace)' : highlight ? 'var(--notification-color)' : 'inherit',
              ...(working ? pulse : {}),
            }}
          />
        </Badge>
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchor.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              width: 420,
              maxWidth: 'calc(100vw - 32px)',
              backgroundColor: 'var(--background-color)',
              color: 'var(--text-color)',
              border: '1px solid var(--border-color)',
            },
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 1,
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <Box sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Agent activity</Box>
          <Box sx={{ flex: 1, fontSize: '0.75rem', color: 'var(--canvas-text-dim)' }}>
            {working ? 'working' : needsDecision ? 'waiting for you' : 'idle'}
          </Box>
          {activity.entries.length > 0 && (
            <ButtonBase sx={{ ...footerButton, color: 'var(--canvas-text-dim)' }} onClick={() => activity.clear()}>
              Clear
            </ButtonBase>
          )}
        </Box>
        <Box sx={{ maxHeight: 420, overflow: 'auto' }} data-testid="agent-activity-log">
          {activity.entries.length === 0 ? (
            <Box sx={{ px: 1.5, py: 2, fontSize: '0.8rem', color: 'var(--canvas-text-dim)' }}>
              Nothing yet. Each call the agent makes shows here as it happens.
            </Box>
          ) : (
            activity.entries.map(entry => <ActivityRow key={entry.id} entry={entry} />)
          )}
        </Box>
        {(needsDecision || global.mcpSessionId) && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, px: 1, py: 0.75 }}>
            {needsDecision && (
              <ButtonBase
                sx={{ ...footerButton, color: 'var(--notification-color)' }}
                onClick={() => {
                  global.focusAgentTab();
                  setOpen(false);
                }}
              >
                Review {pendingApprovals === 1 ? 'the approval' : `${pendingApprovals} approvals`}
              </ButtonBase>
            )}
            {global.mcpSessionId && (
              <ButtonBase
                sx={footerButton}
                onClick={() => {
                  global.focusMcpTab();
                  setOpen(false);
                }}
              >
                Open the agent&apos;s tab
              </ButtonBase>
            )}
          </Box>
        )}
      </Popover>
    </Box>
  );
});

export default McpActivityButton;
