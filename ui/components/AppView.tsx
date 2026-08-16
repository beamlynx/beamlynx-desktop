import { Box, Grid, Typography, useTheme, useMediaQuery, Link } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import { useStores } from '../store/store-container';
import PineTabs from './PineTabs';
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
import NotificationBell from './NotificationBell';
import SettingsButton from './SettingsButton';
import SettingsModal from './settings/SettingsModal';
import { useGlobalKeybindings } from '../hooks/useGlobalKeybindings';
import { LATEST_VERSION } from '../utils/changelog.data';
import { compare } from 'semver';
import { getKeybindingDisplayForCommand } from '../utils/keybindings';
import { GlobalStore } from '../store/global.store';

/**
 * Previously a corner banner floating over the graph panel itself (see the
 * plan doc's canvas-mode follow-up passes) - moved into the header, next to
 * the [Development]/version markers, so it reads as a standing offer from
 * the app itself rather than something bolted onto one panel. Only the
 * "come try it" direction is dressed up: it borrows the classic graph's
 * "candidate" palette (--node-candidate-*), already this app's color for
 * "here's something you could add". The way back is deliberately plain -
 * once someone's already in the experiment, there's nothing left to sell.
 */
const InteractiveViewToggle = observer(({ global }: { global: GlobalStore }) => {
  if (global.canvasModeEnabled) {
    return (
      <Typography
        variant="caption"
        color="gray"
        onClick={() => global.toggleCanvasMode()}
        sx={{
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          '&:hover': { color: 'var(--primary-color)', textDecoration: 'underline' },
        }}
      >
        ← Back to legacy view
      </Typography>
    );
  }
  return (
    <Box
      onClick={() => global.toggleCanvasMode()}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: 1,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        fontSize: 12,
        border: '1px solid var(--node-candidate-border)',
        background: 'var(--node-candidate-bg)',
        color: 'var(--node-candidate-text-color)',
        '&:hover': {
          borderColor: 'var(--primary-color)',
        },
      }}
    >
      <Box
        sx={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--primary-color)',
          flexShrink: 0,
          animation: 'pulse-dot 2s ease-in-out infinite',
          '@keyframes pulse-dot': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.3 },
          },
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
          },
        }}
      />
      Switch to interactive view (experimental)
    </Box>
  );
});

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

  // Define UserContent inside the component so it can access the state.
  // isDesktop() still has to gate out UserBox below - desktop ships without
  // Clerk (see AGENTS.md), so rendering it there would break, not just show
  // an unwanted label - but the desktop build no longer needs its own badge
  // to say so, hence rendering nothing rather than an empty caption.
  const UserContent = isDevelopment() || isPlayground() ? (
    <Typography variant="caption" color="gray">
      {isDevelopment() ? '[Development]' : ''}
      {isPlayground() ? '[Playground]' : ''}
    </Typography>
  ) : isDesktop() ? null : (
    <UserBox />
  );

  if (global.connecting)
    return (
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Typography className="text-primary">Connecting...</Typography>
      </Box>
    );

  // Playground's own connection failing is a distinct, genuine error case
  // (not "you haven't set anything up yet") -- still worth its own screen.
  // Every other not-connected case (including a fresh install with nothing
  // configured) falls through to the normal app shell below; there's no
  // longer a full-page "get started" wall (see ActiveConnection.tsx's own
  // "Not connected to database"/"🔌 No connection to Pine server!" label
  // for how that state is surfaced instead -- inline, not a takeover). Was
  // previously a Docker-run-command onboarding page, which stopped being
  // the right default once the desktop app became the primary distribution.
  if (!global.pineConnected && !global.canvasModeEnabled && isPlayground()) {
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

  if (global.getRequiresUpgrade()) {
    return <UpgradeRequired />;
  }

  return (
    <>
      <AnalysisModal />
      <ChangelogModal open={global.showChangelog} onClose={handleCloseChangelog} />
      <CommandPalette />
      <SavePineModal />
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
              flexWrap: 'wrap',
              rowGap: 0,
            }}
          >
            <InteractiveViewToggle global={global} />
            {!isDesktop() && (
              <Typography variant="caption" color="gray" component="code">
                [{global.version ?? 'obsolete'}]
              </Typography>
            )}
            {UserContent}
            <NotificationBell hasUnreadUpdates={hasUnreadUpdates} onClick={handleOpenChangelog} />
            <SettingsButton onClick={() => global.setShowSettings(true)} />
          </Box>
        </Grid>
      </Grid>
      <SettingsModal />

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
