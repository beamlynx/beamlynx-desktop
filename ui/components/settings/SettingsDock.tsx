import { Box } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS_PANEL_WIDTH, NEW_LAYOUT_GUTTER } from '../../constants';
import { usePanelPresence } from '../../hooks/usePanelPresence';
import { getUserPreference, STORAGE_KEYS } from '../../store/preferences';
import { useStores } from '../../store/store-container';
import { NewLayoutSettingsPanelDivider } from '../ResizableDividers';
import SettingsDockedPanel from './SettingsDockedPanel';

/**
 * Settings' docked column, plus the divider that resizes it, plus the
 * animation that brings both in and out.
 *
 * Its own component rather than JSX inside AppView, for the same reason
 * CollapsibleHeight.tsx is: `usePanelPresence` and the panel's width are
 * React state, and AppView's subtree is the whole application -- PineTabs,
 * every open Session, NewLayoutView, Canvas. Holding this state up there
 * re-rendered all of it several times per open, which is what made the
 * animation stutter. Down here, opening Settings re-renders Settings.
 *
 * Width lives here rather than in a store because nothing else needs it,
 * and it's seeded from the constant rather than a lazy localStorage read --
 * reading localStorage during the first render would disagree with the
 * server's markup (see getUserPreference's own window guard), so the
 * persisted value is applied in the mount effect instead.
 */
const SettingsDock = observer(() => {
  const { global } = useStores();
  const [width, setWidth] = useState(DEFAULT_SETTINGS_PANEL_WIDTH);
  const settings = usePanelPresence<HTMLDivElement>(global.showSettings);

  useEffect(() => {
    setWidth(getUserPreference(STORAGE_KEYS.SETTINGS_PANEL_WIDTH, DEFAULT_SETTINGS_PANEL_WIDTH));
  }, []);

  // Builds Settings' contents once the app has gone quiet, so the FIRST
  // open doesn't have to. That render costs around 55ms, which is three
  // frames of a 200ms animation -- the one open where the panel visibly
  // stuttered, and the one a user forms their impression from.
  //
  // Idle time, not mount: at mount the app is still connecting, restoring
  // tabs and drawing the canvas, and this would compete with all of it.
  // The 3s timeout is the fallback for a browser that never reports an idle
  // moment. requestIdleCallback is absent in some browsers (Safari until
  // recently), hence the setTimeout path.
  //
  // Safe to build early because nothing in here fetches or writes on mount
  // -- the sections only sync local state from the store they already
  // observe.
  const [prewarmed, setPrewarmed] = useState(false);
  useEffect(() => {
    const warm = () => setPrewarmed(true);
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warm, { timeout: 3000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = setTimeout(warm, 3000);
    return () => clearTimeout(id);
  }, []);

  // Built once, then kept. Settings' contents are the most expensive thing
  // in the app to render -- ConnectionsSection alone runs to four figures of
  // lines -- and rebuilding them on every open put that work in the same
  // frames as the opening animation, which is what made it stutter.
  // Measured: a 55ms blocking render on each open, gone once this stopped
  // remounting.
  //
  // `content-visibility: hidden` is what makes keeping it affordable: the
  // subtree stays mounted, with its scroll position and whatever section
  // was last open, but the browser skips laying it out or painting it while
  // it's closed. Before the first open there is nothing to keep, so nothing
  // is rendered at all and a session that never opens Settings never pays
  // for it.
  const everOpened = useRef(false);
  if (settings.mounted) everOpened.current = true;
  if (!settings.mounted && !everOpened.current && !prewarmed) return null;

  return (
    // The panel and the divider are wrapped together (not given individual
    // margins) so the two stretch to match each other's height
    // automatically. NewLayoutView's own outer wrapper insets
    // Canvas/Results from the viewport's bottom edge by NEW_LAYOUT_GUTTER
    // (`my`, not just `mt`), but AppView's row carries only the
    // top/left/right inset; giving the bottom margin here instead of on
    // that row keeps PineTabs itself flush (it supplies its own via
    // NewLayoutView) while still bottom-aligning Settings with
    // Canvas/Results.
    //
    // This same wrapper is what ANIMATES, and it has to be this one rather
    // than the panel Box inside it. Two reasons, both of which look like
    // bugs if you animate the inner box: the divider and the panel's own
    // 1px borders aren't inside it, so it would bottom out at a ~10px
    // sliver that then snaps away at unmount -- a pop at exactly the moment
    // this is meant to smooth over; and the panel's contents would
    // re-lay-out at every width between full and zero, rewrapping text and
    // collapsing controls the whole way down. Clipping a wrapper whose
    // children hold their real size (both carry flexShrink: 0) slides the
    // panel out of view intact instead.
    <Box
      ref={settings.ref}
      data-panel-motion
      sx={{
        display: 'flex',
        flexDirection: 'row',
        mb: global.isZenModeActive ? 0 : 1,
        flexShrink: 0,
        overflow: 'hidden',
        contentVisibility: settings.mounted ? 'visible' : 'hidden',
        width: settings.open ? width + NEW_LAYOUT_GUTTER : 0,
        opacity: settings.open ? 1 : 0,
        transition: settings.open
          ? 'width var(--motion-enter) var(--motion-ease-enter), opacity var(--motion-enter) var(--motion-ease-enter)'
          : 'width var(--motion-exit) var(--motion-ease-exit), opacity var(--motion-exit) var(--motion-ease-exit)',
      }}
    >
      <Box
        sx={{
          width,
          flexShrink: 0,
          // Matches Canvas's own pane wrapper in NewLayoutView (same token,
          // same radius) rather than a bare border - every other docked
          // pane in New Layout reads as a bordered card, and Settings
          // should too instead of looking like the odd one out.
          border: '1px solid var(--border-color)',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <SettingsDockedPanel open={settings.open} />
      </Box>
      <NewLayoutSettingsPanelDivider settingsPanelWidth={width} setSettingsPanelWidth={setWidth} />
    </Box>
  );
});

export default SettingsDock;
