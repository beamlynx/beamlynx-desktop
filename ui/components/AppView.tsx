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
 * The header's only mention of layout - never graph mode/canvas mode (that
 * switch lives inside the graph/canvas widget itself now, in Legacy Layout's
 * own MainView - see Session.tsx's InteractiveViewToggle - so this and that
 * never appear in the same place and can't be read as one confusing set of
 * choices). Always rendered, names whichever layout you'd switch TO.
 */
const LayoutSwitcher = observer(({ global }: { global: GlobalStore }) => (
  <Typography
    variant="caption"
    color="gray"
    onClick={() => global.toggleLayoutMode()}
    sx={{
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      '&:hover': { color: 'var(--primary-color)', textDecoration: 'underline' },
    }}
  >
    {global.layoutMode === 'new' ? 'Switch to legacy layout' : 'Switch to new layout'}
  </Typography>
));

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
  if (!global.pineConnected && !global.canvasActive && isPlayground()) {
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
            <LayoutSwitcher global={global} />
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
          edge visually touched the tab row's top edge.

          flex: 1, minHeight: 0 - this is what makes the tab content fill
          exactly the rest of the viewport below the header, however tall
          the header actually renders (font metrics, connection-name
          wrapping, OS chrome, etc. all vary this in ways a hardcoded
          `calc(100vh - Npx)` guess can't track - see constants.ts's
          LAYOUT_HEIGHTS comment for the drift this used to cause).
          Flexbox's own `flex: 1` already accounts for its own margin and
          every sibling's natural size automatically - no pixel arithmetic
          needed. Requires pages/index.tsx's Container to be the
          `display:flex, flexDirection:column, height:100vh` ancestor this
          box measures against (it is), and every box down the chain to
          Session/NewLayoutView's own root to keep passing that sizing
          through the same way (flex:1 for a flex child with siblings,
          height:'100%' for a single/only child) rather than reintroducing
          a calc(100vh - ...) guess at some new layer. */}
      <Box sx={{ m: 1, mt: 1, mb: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <PineTabs></PineTabs>
      </Box>
    </>
  );
});

export default AppView;
