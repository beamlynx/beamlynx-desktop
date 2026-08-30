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
import { DEFAULT_SETTINGS_PANEL_WIDTH } from '../constants';
import AnalysisModal from './AnalysisModal';
import ChangelogModal from './ChangelogModal';
import CommandPalette from './CommandPalette';
import SavePineModal from './SavePineModal';
import NotificationBell from './NotificationBell';
import SettingsButton from './SettingsButton';
import SettingsModal from './settings/SettingsModal';
import SettingsDockedPanel from './settings/SettingsDockedPanel';
import { NewLayoutSettingsPanelDivider } from './ResizableDividers';
import { useGlobalKeybindings } from '../hooks/useGlobalKeybindings';
import { useFocusedPanelTracking } from '../hooks/useFocusedPanelTracking';
import { useSettingsKeybindings } from '../hooks/useSettingsKeybindings';
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
  // New Layout's docked Settings panel width - lives here (a sibling of
  // PineTabs), not inside NewLayoutView, since global.showSettings is
  // app-wide state, not per-session: nesting the dock inside a specific
  // tab's own render tree meant it only showed for whichever tab happened
  // to be active, and vanished on switching tabs instead of staying put
  // like the rest of the app's chrome (confirmed live - reported as
  // "settings show inside a tab, it should show on the left of all the
  // tabs as well").
  const [settingsPanelWidth, setSettingsPanelWidth] = useState(DEFAULT_SETTINGS_PANEL_WIDTH);

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
  // Which panel (Canvas/Settings/Input) currently owns bare-key input --
  // see GlobalStore.activeKeyboardPanel's own comment.
  useFocusedPanelTracking({ global });
  useSettingsKeybindings({ global });

  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('lg'));

  useEffect(() => {
    setMounted(true);

    // Check for unread updates
    const lastReadVersion = getUserPreference(STORAGE_KEYS.LAST_READ_VERSION, '0.0.0');
    const hasUpdates = compare(LATEST_VERSION, lastReadVersion) > 0;
    setHasUnreadUpdates(hasUpdates);

    setSettingsPanelWidth(
      getUserPreference(STORAGE_KEYS.SETTINGS_PANEL_WIDTH, DEFAULT_SETTINGS_PANEL_WIDTH),
    );
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
  const UserContent =
    isDevelopment() || isPlayground() ? (
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
      {/* Hidden entirely in Zen mode, not just visually de-emphasized -- Zen
          mode's whole point is a graph-only view, and every one of these
          (connection picker, search bar, layout switcher, gear icon) is
          exactly the "everything else" it hides. The modals above are
          untouched (separate components, not part of this Grid), so e.g.
          the command palette shortcut still works to get back out. */}
      {!global.isZenModeActive && (
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
              <SettingsButton onClick={() => global.setShowSettings(!global.showSettings)} />
            </Box>
          </Grid>
        </Grid>
      )}
      {/* New Layout docks Settings as a panel here (a sibling of PineTabs,
          spanning every tab, not just the active one - see the
          settingsPanelWidth comment above) rather than mounting it as a
          floating overlay - see SettingsDockedPanel.tsx. Legacy keeps the
          floating Modal, since it never shows Canvas and Results at once
          (Session.tsx's MainView mode-switches between them), so there's
          nothing a docked panel there would avoid covering. */}
      {global.layoutMode !== 'new' && <SettingsModal />}

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
          a calc(100vh - ...) guess at some new layer. This row wrapper is
          that flex:1/minHeight:0 child now (rather than the PineTabs box
          directly) so the docked Settings panel can be its sibling and
          span the same full height, tab strip included.

          mt/ml/mr live on the ROW itself, not on the PineTabs box below --
          they used to live there, which put the inset only on PineTabs'
          side. That left two bugs once Settings became this row's other
          child: Settings had no top margin of its own, so its top sat 8px
          above the tab strip instead of level with it: and PineTabs' own
          8px LEFT margin added on top of the divider's own 8px gap
          doubled the visual gap between Settings and Canvas to 16px,
          versus the plain 8px gap every other pane boundary in New Layout
          uses. Applying the inset once, to the row, makes Settings and
          PineTabs start flush and top-aligned with each other, with
          exactly the divider's own width between them -- matching every
          other docked pane. */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          flex: 1,
          minHeight: 0,
          mt: global.isZenModeActive ? 0 : 1,
          ml: global.isZenModeActive ? 0 : 1,
          mr: global.isZenModeActive ? 0 : 1,
        }}
      >
        {global.layoutMode === 'new' && global.showSettings && (
          // Wrapped together (not given individual margins) so the Box and
          // the divider stretch to match each other's height automatically
          // -- NewLayoutView's own outer wrapper insets Canvas/Results from
          // the viewport's bottom edge by NEW_LAYOUT_GUTTER (`my`, not just
          // `mt`), but this row (above) only carries the top/left/right
          // inset; giving the bottom margin here instead of on the row
          // keeps PineTabs itself flush (it doesn't need it - NewLayoutView
          // supplies its own), while still bottom-aligning Settings with
          // Canvas/Results.
          <Box sx={{ display: 'flex', flexDirection: 'row', mb: global.isZenModeActive ? 0 : 1 }}>
            <Box
              sx={{
                width: settingsPanelWidth,
                flexShrink: 0,
                // Matches Canvas's own pane wrapper in NewLayoutView (same
                // token, same radius) rather than a bare border - every
                // other docked pane in New Layout reads as a bordered card,
                // and Settings should too instead of looking like the odd
                // one out.
                border: '1px solid var(--border-color)',
                borderRadius: 1,
                overflow: 'hidden',
              }}
            >
              <SettingsDockedPanel />
            </Box>
            <NewLayoutSettingsPanelDivider
              settingsPanelWidth={settingsPanelWidth}
              setSettingsPanelWidth={setSettingsPanelWidth}
            />
          </Box>
        )}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <PineTabs></PineTabs>
        </Box>
      </Box>
    </>
  );
});

export default AppView;
