import { IconButton, Box, Badge } from '@mui/material';
import { SmartToyOutlined } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';

/**
 * The one header affordance for everything the agent is doing: its
 * investigations (store/investigations.ts) and any pending reveal requests.
 * PineTabs.tsx pins a tab for each. Deliberately ONE icon rather than one per
 * concept: a robot carrying a count reads immediately as "the agent wants
 * two things".
 *
 * Only rendered once there's something: the agent's first call of any kind.
 * An always-on icon for a feature most sessions never touch would be clutter
 * next to the bell and the gear.
 *
 * While the agent works the robot pulses in the accent colour, and its
 * tooltip says what it is doing. Working includes the pauses between calls,
 * while the agent thinks (AgentActivityStore's LINGER_MS).
 *
 * Clicking it opens what most needs you: a decision the agent is waiting on,
 * or else the current investigation's tab, whose timeline shows every step.
 * The two states are weighted differently: a count badge for decisions, which
 * block an agent, and the bell's amber for results that landed while you were
 * looking elsewhere.
 */

// The pulse while the agent works: the robot breathes rather than spins, so
// it reads as "busy" without pulling the eye the way a spinner does.
const pulse = {
  animation: 'pine-agent-pulse 1.4s ease-in-out infinite',
  '@keyframes pine-agent-pulse': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.35 },
  },
};

const McpActivityButton = observer(() => {
  const { global } = useStores();
  const activity = global.agentActivity;
  const waiting = global.agentDecisionsWaiting;

  if (global.investigations.length === 0 && waiting === 0) return null;

  const highlight = waiting > 0 || global.mcpHasUnseenActivity;
  const working = activity.working;
  const current = activity.current;

  return (
    <Box sx={{ ml: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <IconButton
        onClick={() => global.focusAgentTab()}
        color="inherit"
        title={working ? (current ? `Agent: ${current.summary}` : 'Agent: working') : 'Open the agent’s investigation'}
        aria-label={
          waiting > 0
            ? `Agent (${waiting} waiting for your answer)`
            : working
              ? 'Agent investigation (working)'
              : global.mcpHasUnseenActivity
                ? 'Agent investigation (new results)'
                : 'Agent investigation'
        }
      >
        <Badge
          badgeContent={waiting}
          sx={{
            // --background-color as the badge's own text is what makes this
            // legible in all three themes without a per-theme override:
            // each theme's notification amber is already tuned to stand out
            // against that theme's background, so using one as the other's
            // text inverts cleanly.
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
    </Box>
  );
});

export default McpActivityButton;
