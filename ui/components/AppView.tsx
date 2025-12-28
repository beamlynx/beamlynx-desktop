import {
  Box,
  Grid,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Switch,
  useTheme,
  useMediaQuery,
  ListItemIcon,
  Link,
} from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import PineTabs from './PineTabs';
import { Welcome } from './docs/Welcome';
import { PineServerNotRunning } from './docs/PineServerNotRunning';
import { UpgradeRequired } from './docs/UpgradeRequired';
import ActiveConnection from './ActiveConnection';
import Message from './Message';
import UserBox from './UserBox';
import { isDevelopment, isPlayground } from '../store/util';
import { Settings, Analytics } from '@mui/icons-material';
import { useState, useEffect, useCallback } from 'react';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from '../store/preferences';
import AnalysisModal from './AnalysisModal';
import ChangelogModal from './ChangelogModal';
import CommandPalette from './CommandPalette';
import NotificationBell from './NotificationBell';
import { useGlobalKeybindings } from '../hooks/useGlobalKeybindings';
import { LATEST_VERSION } from '../utils/changelog.data';
import { compare } from 'semver';

const AppView = observer(() => {
  const { global } = useStores();
  const session = global.getSession(global.activeSessionId);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [mounted, setMounted] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [hasUnreadUpdates, setHasUnreadUpdates] = useState(false);

  const handleOpenChangelog = () => {
    setShowChangelog(true);
    setHasUnreadUpdates(false);
  };

  const handleCloseChangelog = () => {
    setShowChangelog(false);
  };

  // Initialize global keyboard shortcuts
  useGlobalKeybindings({
    session,
    global,
    focusInput: () => session.focusTextInput(),
    callbacks: {
      openChangelog: handleOpenChangelog,
    },
  });

  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('lg'));

  useEffect(() => {
    setMounted(true);
    
    // Check for unread updates
    const lastReadVersion = getUserPreference(STORAGE_KEYS.LAST_READ_VERSION, '0.0.0');
    const hasUpdates = compare(LATEST_VERSION, lastReadVersion) > 0;
    setHasUnreadUpdates(hasUpdates);
  }, []);

  useEffect(() => {
    global.handleUrlParameters();
  }, [global]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleOpenAnalysis = () => {
    global.setShowAnalysis(true);
    handleMenuClose();
  };

  // Prevent hydration errors by ensuring the same component is rendered on server and client initial render
  if (!mounted) {
    return null;
  }

  // Define UserContent inside the component so it can access the state
  const UserContent =
    isDevelopment() || isPlayground() ? (
      <Typography variant="caption" color="gray">
        {isDevelopment() ? '[Develoment]' : ''}
        {isPlayground() ? '[Playground]' : ''}
      </Typography>
    ) : (
      <UserBox />
    );

  if (global.connecting)
    return (
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Typography className="text-primary">Connecting...</Typography>
      </Box>
    );

  if (!global.pineConnected) {
    if (isPlayground()) {
      return (
        <Box
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Typography className="text-primary">
            Something went wrong with the playground connection
          </Typography>
          <Link
            href="https://github.com/beamlynx/pine-app/issues/new"
            target="_blank"
            underline="hover"
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            Please create an issue on GitHub
          </Link>
        </Box>
      );
    }

    return (
      <Box
        sx={{
          p: 2,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          animation: 'fadeIn 0.5s ease-in',
          '@keyframes fadeIn': {
            '0%': {
              opacity: 0,
            },
            '100%': {
              opacity: 1,
            },
          },
        }}
      >
        {global.onboardingServer ? <PineServerNotRunning /> : <Welcome />}
      </Box>
    );
  }

  session.isSmallScreen = isSmallScreen;
  session.forceCompactMode = global.forceCompactMode;

  if (global.getRequiresUpgrade()) {
    return <UpgradeRequired />;
  }

  return (
    <>
      <AnalysisModal />
      <ChangelogModal open={showChangelog} onClose={handleCloseChangelog} />
      <CommandPalette onOpenChangelog={handleOpenChangelog} />
      <Grid container>
        <Grid item xs={3}>
          <Box sx={{ m: 2, mt: 1 }}>
            <ActiveConnection />
          </Box>
        </Grid>

        <Grid item xs={6}>
          <Box sx={{ m: 1, display: 'flex', justifyContent: 'center' }}>
            <Box
              onClick={() => global.setShowCommandPalette(true)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                width: 600,
                maxWidth: '90vw',
                padding: '8px 16px',
                backgroundColor: 'var(--node-column-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 1,
                cursor: 'pointer',
                visibility: global.showCommandPalette ? 'hidden' : 'visible',
                '&:hover': {
                  borderColor: 'var(--primary-color)',
                  backgroundColor: 'var(--background-color)',
                },
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  color: 'var(--text-color)',
                  opacity: 0.6,
                  userSelect: 'none',
                }}
              >
                Search commands... (Ctrl+Shift+P)
              </Typography>
            </Box>
            {/* <Message /> */}
          </Box>
        </Grid>

        <Grid item xs={3}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            {UserContent}
            <NotificationBell
              hasUnreadUpdates={hasUnreadUpdates}
              onClick={handleOpenChangelog}
            />
            <IconButton onClick={handleMenuOpen} sx={{ ml: 1 }} color="inherit" tabIndex={2}>
              <Settings />
            </IconButton>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
              <MenuItem onClick={handleOpenAnalysis}>
                <ListItemIcon>
                  <Analytics />
                </ListItemIcon>
                Analysis
              </MenuItem>
              <MenuItem onClick={() => global.toggleTheme()}>
                <ListItemIcon>
                  <Switch checked={global.theme === 'dark'} size="small" />
                </ListItemIcon>
                Dark Mode
              </MenuItem>
              <MenuItem onClick={() => session.toggleVimMode()}>
                <ListItemIcon>
                  <Switch checked={session.vimMode} size="small" />
                </ListItemIcon>
                Vim Mode
              </MenuItem>
              <MenuItem
                disabled={isSmallScreen}
                onClick={() => {
                  if (isSmallScreen) return;
                  global.toggleCompactMode();
                }}
              >
                <ListItemIcon>
                  <Switch
                    checked={isSmallScreen || global.forceCompactMode}
                    size="small"
                    disabled={isSmallScreen}
                  />
                </ListItemIcon>
                Compact mode
              </MenuItem>
              <MenuItem
                onClick={() => (session.mode = session.mode === 'monitor' ? 'graph' : 'monitor')}
              >
                <ListItemIcon>
                  <Switch checked={session.mode === 'monitor'} size="small" />
                </ListItemIcon>
                Connection Monitor
              </MenuItem>
            </Menu>
          </Box>
        </Grid>
      </Grid>

      <Box sx={{ m: 1, display: 'flex', flexDirection: 'column' }}>
        <PineTabs></PineTabs>
      </Box>
    </>
  );
});

export default AppView;
