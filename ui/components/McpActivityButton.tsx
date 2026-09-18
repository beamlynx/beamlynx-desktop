import { IconButton, Box } from '@mui/material';
import { SmartToyOutlined } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';

/**
 * Header entry point for the pinned Agent-activity tab (see PineTabs.tsx and
 * GlobalStore.mcpSessionId's own comment). Only rendered once an MCP-driven
 * query has actually run (global.mcpSessionId set) -- before that there's
 * nothing to show, and an always-on icon for a feature most sessions never
 * touch would just be clutter next to the bell/gear. The dot mirrors
 * NotificationBell's hasUnreadUpdates treatment: on from the moment a query
 * lands until the tab is activated (revealMcpSession clears it there, not
 * here).
 */
const McpActivityButton = observer(() => {
  const { global } = useStores();

  if (!global.mcpSessionId) return null;

  return (
    <Box sx={{ ml: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <IconButton
        onClick={() => global.revealMcpSession()}
        color="inherit"
        aria-label={
          global.mcpHasUnseenActivity ? 'Agent activity (new results)' : 'Agent activity'
        }
      >
        <SmartToyOutlined
          sx={{ color: global.mcpHasUnseenActivity ? 'var(--notification-color)' : 'inherit' }}
        />
      </IconButton>
    </Box>
  );
});

export default McpActivityButton;
