import { Box, Grid, Typography, useTheme, useMediaQuery, Link } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import { useStores } from '../store/store-container';
import PineTabs from './PineTabs';
import { Welcome } from './docs/Welcome';
import { PineServerNotRunning } from './docs/PineServerNotRunning';
import { UpgradeRequired } from './docs/UpgradeRequired';
import ActiveConnection from './ActiveConnection';
import Message from './Message';
import UserBox from './UserBox';
import { isDesktop, isDevelopment, isPlayground } from '../store/util';
import { useState, useEffect, useCallback } from 'react';
import { getUserPreference, STORAGE_KEYS } from '../store/preferences';
import AnalysisModal from './AnalysisModal';
import ChangelogModal from './ChangelogModal';
import CommandPalette from './CommandPalette';
import SavePineModal from './SavePineModal';
import ConnectionsListModal from './ConnectionsListModal';
import NotificationBell from './NotificationBell';
import { useGlobalKeybindings } from '../hooks/useGlobalKeybindings';
import { LATEST_VERSION } from '../utils/changelog.data';
import { compare } from 'semver';
import { getKeybindingDisplayForCommand } from '../utils/keybindings';

const AppView = observer(() => {
  const { global } = useStores();
  const session = global.getSession(global.activeSessionId);
  const [mounted, setMounted] = useState(false);
  const [hasUnreadUpdates, setHasUnreadUpdates] = useState(false);

  const handleOpenChangelog = () => {
    global.setShowChangelog(true);
    setHasUnreadUpdates(false);
  };

  const handleCloseChangelog = () => {
    global.setShowChangelog(false);
  };

  // Initialize global keyboard shortcuts
  useGlobalKeybindings({
    session,
    global,
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

  useEffect(() => {
    runInAction(() => {
      session.isSmallScreen = isSmallScreen;
    });
  }, [session, isSmallScreen]);

  // Prevent hydration errors by ensuring the same component is rendered on server and client initial render
  if (!mounted) {
    return null;
  }

  // Define UserContent inside the component so it can access the state
  const UserContent =
    isDevelopment() || isPlayground() || isDesktop() ? (
      <Typography variant="caption" color="gray">
        {isDevelopment() ? '[Develoment]' : ''}
        {isPlayground() ? '[Playground]' : ''}
        {isDesktop() ? '[Desktop]' : ''}
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

  // Interactive/canvas mode is an explicit, already-opted-into experiment -
  // showing it the marketing "Hey there" onboarding (or its "server not
  // running" sibling) every time pineConnected hasn't caught up yet (e.g. a
  // session with no saved connection, whose only ping is the background
  // polling in pages/index.tsx) just blocks the thing the user already chose
  // to use. Skip straight to the normal app shell instead; Canvas.tsx already
  // degrades on its own (dimmed graph + banner) when there's nothing to show.
  if (!global.pineConnected && !global.canvasModeEnabled) {
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

  if (global.getRequiresUpgrade()) {
    return <UpgradeRequired />;
  }

  return (
    <>
      <AnalysisModal />
      <ChangelogModal open={global.showChangelog} onClose={handleCloseChangelog} />
      <CommandPalette />
      <SavePineModal />
      <ConnectionsListModal />
      <Grid container>
        <Grid item xs={3}>
          <Box sx={{ m: 2, mt: 1, mb: 0 }}>
            <ActiveConnection />
          </Box>
        </Grid>

        <Grid item xs={6}>
          <Box sx={{ m: 1, mt: 1, mb: 0, display: 'flex', justifyContent: 'center' }}>
            <Box
              onClick={() => global.setShowCommandPalette(true)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                width: 600,
                maxWidth: '90vw',
                padding: '10px 16px',
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
                  lineHeight: 1.5,
                }}
              >
                Search commands... ({getKeybindingDisplayForCommand('command-palette')})
              </Typography>
            </Box>
            {/* <Message /> */}
          </Box>
        </Grid>

        <Grid item xs={3}>
          <Box
            sx={{
              m: 1,
              mt: 0,
              mb: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 1,
            }}
          >
            {!isDesktop() && (
              <Typography variant="caption" color="gray" component="code">
                [{global.version ?? 'obsolete'}]
              </Typography>
            )}
            {UserContent}
            <NotificationBell hasUnreadUpdates={hasUnreadUpdates} onClick={handleOpenChangelog} />
          </Box>
        </Grid>
      </Grid>

      {/* mt: 1 (not 0) - the header row above and the tab row below both
          have their own solid background now (previously neither did, so
          zero margin was invisible); with no gap the search box's bottom
          edge visually touched the tab row's top edge. */}
      <Box sx={{ m: 1, mt: 1, mb: 0, display: 'flex', flexDirection: 'column' }}>
        <PineTabs></PineTabs>
      </Box>
    </>
  );
});

export default AppView;
