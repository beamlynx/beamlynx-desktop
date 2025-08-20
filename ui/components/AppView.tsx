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
import ActiveConnection from './ActiveConnection';
import Message from './Message';
import UserBox from './UserBox';
import { isDevelopment, isPlayground } from '../store/util';
import { Settings, Analytics } from '@mui/icons-material';
import { useState, useEffect } from 'react';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from '../store/preferences';
import AnalysisModal from './AnalysisModal';

const AppView = observer(() => {
  const { global } = useStores();
  const session = global.getSession(global.activeSessionId);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [mounted, setMounted] = useState(false);

  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('lg'));
  const [forceSmallScreen, setForceSmallScreen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const storedForceSmallScreen = getUserPreference(STORAGE_KEYS.FORCE_COMPACT_MODE, false);
    setForceSmallScreen(storedForceSmallScreen);
  }, []);

  useEffect(() => {
    global.handleUrlParameters();
  }, [global]);

  const handleToggleForceSmallScreen = () => {
    const newValue = !forceSmallScreen;
    setForceSmallScreen(newValue);
    setUserPreference(STORAGE_KEYS.FORCE_COMPACT_MODE, newValue);
  };

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
        {isPlayground() ? '[Playground]' : 'none'}
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
  session.forceCompactMode = forceSmallScreen;

  return (
    <>
      <AnalysisModal />
      <Grid container>
        <Grid item xs={3}>
          <Box sx={{ m: 2, mt: 1 }}>
            <ActiveConnection />
          </Box>
        </Grid>

        <Grid item xs={8}>
          <Box sx={{ m: 1 }}>
            <Message />
          </Box>
        </Grid>

        <Grid item xs={1}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            {UserContent}
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
                  handleToggleForceSmallScreen();
                }}
              >
                <ListItemIcon>
                  <Switch
                    checked={isSmallScreen || forceSmallScreen}
                    size="small"
                    disabled={isSmallScreen}
                  />
                </ListItemIcon>
                Compact mode
              </MenuItem>
              <MenuItem onClick={() => session.mode = session.mode === 'monitor' ? 'graph' : 'monitor'}>
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
