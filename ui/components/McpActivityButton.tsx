import { IconButton, Box, Badge } from '@mui/material';
import { SmartToyOutlined } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';

/**
 * The one header affordance for everything the agent is doing -- both the
 * MCP activity tab and any pending reveal requests (see PineTabs.tsx, which
 * pins a tab for each). Deliberately ONE icon rather than one per concept:
 * an eye on its own in a header row says nothing, where a robot carrying a
 * count reads immediately as "the agent wants two things", and a third agent
 * concept later needs no third icon.
 *
 * Only rendered once there's actually something -- before that there's
 * nothing to show, and an always-on icon for a feature most sessions never
 * touch would just be clutter next to the bell/gear.
 *
 * The two states it distinguishes are deliberately weighted differently:
 * a count badge for pending approvals, which are blocking an agent and need
 * a decision, and the same amber the bell uses for unseen activity, which is
 * only ever "a result landed while you were looking elsewhere". Clicking
 * goes to whichever is more urgent -- see GlobalStore.focusAgentTab.
 */
const McpActivityButton = observer(() => {
  const { global } = useStores();
  const pendingApprovals = global.pendingRevealSessionIds.length;

  if (!global.mcpSessionId && pendingApprovals === 0) return null;

  const needsDecision = pendingApprovals > 0;
  const highlight = needsDecision || global.mcpHasUnseenActivity;

  return (
    <Box sx={{ ml: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <IconButton
        onClick={() => global.focusAgentTab()}
        color="inherit"
        aria-label={
          needsDecision
            ? `Agent (${pendingApprovals} waiting for your approval)`
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
            sx={{ color: highlight ? 'var(--notification-color)' : 'inherit' }}
          />
        </Badge>
      </IconButton>
    </Box>
  );
});

export default McpActivityButton;
