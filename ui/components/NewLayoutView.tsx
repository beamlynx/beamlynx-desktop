import { Box, useMediaQuery, useTheme } from '@mui/material';
import { ViewColumnOutlined, ViewStreamOutlined } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import {
  DEFAULT_NEW_LAYOUT_PANE_HEIGHT,
  DEFAULT_NEW_LAYOUT_PANE_WIDTH,
  DEFAULT_NEW_LAYOUT_PANEL_HEIGHT,
  DEFAULT_NEW_LAYOUT_PANEL_WIDTH,
  NEW_LAYOUT_GUTTER,
} from '../constants';
import { usePanelPresence } from '../hooks/usePanelPresence';
import { MOTION, motionDuration } from '../styles/motion';
import { getUserPreference, STORAGE_KEYS } from '../store/preferences';
import { useStores } from '../store/store-container';
import Canvas from './canvas/Canvas';
import CollapsibleHeight from './CollapsibleHeight';
import ErrorMessage from './ErrorMessage';
import Input, { RunButton } from './Input';
import { Monitor } from './Monitor';
import {
  NewLayoutHorizontalPanelDivider,
  NewLayoutHorizontalPaneDivider,
  NewLayoutPaneDivider,
  NewLayoutPanelDivider,
} from './ResizableDividers';
import Result from './Result';

type Orientation = 'horizontal' | 'vertical'; // horizontal = side-by-side, vertical = top-bottom

interface NewLayoutViewProps {
  sessionId: string;
}

/**
 * The right pane: Results, with an error band above it when the last run
 * failed. The plain Canvas|Results split has no other slot for it, and
 * auto-run makes execution failures (a query that parses fine but fails at
 * the DB) a routine occurrence here, not a corner case.
 *
 * Also handles `session.mode === 'monitor'` (see the `toggle-connection-monitor`
 * command), since there's no other dedicated pane for it.
 */
const RightPane = observer(({ sessionId }: { sessionId: string }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);

  if (session.mode === 'monitor') {
    return <Monitor sessionId={sessionId} height="100%" />;
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Always rendered, collapsed to zero height when there's no error,
          rather than mounted and unmounted on `session.error`. Auto-run
          makes a failed query an ordinary event, so this band appears and
          disappears more often than anything else in the app, and it used
          to shove the results grid down a line in a single frame every
          time. On the short duration deliberately - it's usually a
          transient state on the way to a working query, and anything
          slower would feel like being told off.

          ErrorMessage keeps its own `if (!session.error) return null` as
          the safety net it always was; presence is owned here, by the one
          element that can animate. */}
      <CollapsibleHeight
        expanded={Boolean(session.error)}
        transition="height var(--motion-fast) var(--motion-ease-enter)"
        contentSx={{
          opacity: session.error ? 1 : 0,
          transition: 'opacity var(--motion-fast) var(--motion-ease-enter)',
        }}
      >
        <ErrorMessage />
      </CollapsibleHeight>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <Result sessionId={sessionId} />
      </Box>
    </Box>
  );
});

/**
 * The left/top pane: Canvas, plus (when toggled on) an editable Pine/SQL
 * text panel next to it - reuses Input.tsx unmodified, including its
 * existing PINE/SQL toggle and RunButton, rather than duplicating that UI.
 *
 * The panel stacks below Canvas when the overall layout is side-by-side
 * (this pane is already a narrow column, so a second, internal top/bottom
 * split reads fine - still only two columns overall: this one and
 * Results). When the overall layout is top/bottom, though, stacking a third
 * thing below Canvas here would put three widgets in one vertical run
 * (Canvas, panel, Results) - so in that orientation the panel sits beside
 * Canvas instead, keeping this pane's own split on the opposite axis from
 * the outer one.
 */
const LeftPane = observer(
  ({
    sessionId,
    isHorizontal,
    onToggleOrientation,
    recenterRequestCount,
  }: {
    sessionId: string;
    isHorizontal: boolean;
    onToggleOrientation: () => void;
    recenterRequestCount: number;
  }) => {
    const { global } = useStores();
    const session = global.getSession(sessionId);
    const panelVisible = global.newLayoutPanelVisible;
    // Keeps the panel (and its divider) mounted through the closing
    // transition -- see hooks/usePanelPresence.ts.
    const panel = usePanelPresence(panelVisible);
    // Only when the outer split is top/bottom - see the doc comment above.
    // Keyed on `panel.mounted`, not on panelVisible: the flag flips the
    // instant the toggle is hit, and this decides the flex AXIS, so reading
    // it directly would swap the panel from a row to a column halfway
    // through its own closing animation.
    const panelBesideCanvas = panel.mounted && !isHorizontal;

    const [panelWidth, setPanelWidth] = useState(DEFAULT_NEW_LAYOUT_PANEL_WIDTH);
    const [panelHeight, setPanelHeight] = useState(DEFAULT_NEW_LAYOUT_PANEL_HEIGHT);
    useEffect(() => {
      setPanelWidth(
        getUserPreference(STORAGE_KEYS.NEW_LAYOUT_PANEL_WIDTH, DEFAULT_NEW_LAYOUT_PANEL_WIDTH),
      );
      setPanelHeight(
        getUserPreference(STORAGE_KEYS.NEW_LAYOUT_PANEL_HEIGHT, DEFAULT_NEW_LAYOUT_PANEL_HEIGHT),
      );
    }, []);

    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: panelBesideCanvas ? 'row' : 'column',
          minHeight: 0,
        }}
      >
        <Box
          data-keyboard-panel="graph"
          // -1, not a real Tab stop -- see SettingsDockedPanel.tsx's
          // identical comment; reachable only by clicking.
          tabIndex={-1}
          onMouseDownCapture={e => {
            // See SettingsDockedPanel.tsx's identical handler for why this
            // check exists -- ReactFlow's own nodes/controls manage their own
            // focus, and this must not fight that.
            const target = e.target as HTMLElement;
            if (!target.closest('input, textarea, button, [tabindex], [contenteditable="true"]')) {
              e.currentTarget.focus();
            }
          }}
          sx={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            border: '1px solid var(--border-color)',
            borderRadius: 1,
            overflow: 'hidden',
            backgroundColor: 'var(--graph-background)',
            outline: 'none',
          }}
        >
          <Canvas
            sessionId={sessionId}
            recenterRequestCount={recenterRequestCount}
            toolbarExtraAction={{
              icon: isHorizontal ? (
                <ViewStreamOutlined style={{ width: 15, height: 15 }} />
              ) : (
                <ViewColumnOutlined style={{ width: 15, height: 15 }} />
              ),
              tooltip: isHorizontal ? 'Switch to top / bottom' : 'Switch to side by side',
              onClick: onToggleOrientation,
            }}
          />
          {/* Run belongs with the canvas, not the results - it acts on
              what the canvas just built. The Pine/SQL panel already has its
              own RunButton (Input.tsx) when it's open. Safe from
              Result.tsx's download/chart icons now that those sit inside
              their own box in New Layout (see Result.tsx's compactMode). */}
          {/* Cross-faded rather than mounted/unmounted on panelVisible:
              the panel's own RunButton is arriving (or leaving) at the same
              moment, and a hard swap made one blink out a frame before the
              other appeared. `visibility` rides along with the opacity so
              the hidden one isn't focusable or clickable - opacity alone
              leaves an invisible button sitting over the canvas corner. */}
          <Box
            sx={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              zIndex: 20,
              opacity: panelVisible ? 0 : 1,
              visibility: panelVisible ? 'hidden' : 'visible',
              transition: `opacity var(--motion-fast) ease, visibility var(--motion-fast)`,
            }}
          >
            <RunButton session={session} />
          </Box>
        </Box>
        {/* The panel and its divider used to be two separate
            `{panelVisible && ...}` siblings. They're wrapped together now
            because this wrapper is what animates: it clips (overflow:
            hidden) while both children keep their real size, so the panel
            SLIDES out of view instead of being squeezed to nothing with its
            editor reflowing the whole way down. Wrapping them also means the
            divider can't blink out on its own while the panel is still
            animating, which is what separate siblings would do. */}
        {panel.mounted && (
          <Box
            ref={panel.ref}
            data-panel-motion
            sx={{
              display: 'flex',
              flexDirection: panelBesideCanvas ? 'row' : 'column',
              flexShrink: 0,
              overflow: 'hidden',
              opacity: panel.open ? 1 : 0,
              ...(panelBesideCanvas
                ? { width: panel.open ? panelWidth + NEW_LAYOUT_GUTTER : 0 }
                : { height: panel.open ? panelHeight + NEW_LAYOUT_GUTTER : 0 }),
              transition: panel.open
                ? 'width var(--motion-enter) var(--motion-ease-enter), height var(--motion-enter) var(--motion-ease-enter), opacity var(--motion-enter) var(--motion-ease-enter)'
                : 'width var(--motion-exit) var(--motion-ease-exit), height var(--motion-exit) var(--motion-ease-exit), opacity var(--motion-exit) var(--motion-ease-exit)',
            }}
          >
            {panelBesideCanvas ? (
              <NewLayoutPanelDivider panelWidth={panelWidth} setPanelWidth={setPanelWidth} />
            ) : (
              <NewLayoutHorizontalPanelDivider
                panelHeight={panelHeight}
                setPanelHeight={setPanelHeight}
              />
            )}
            <Box
              data-keyboard-panel="input"
              // -1, not a real Tab stop -- see SettingsDockedPanel.tsx's
              // identical comment; reachable only by clicking.
              tabIndex={-1}
              onMouseDownCapture={e => {
                // See SettingsDockedPanel.tsx's identical handler -- Input's
                // CodeMirror editor manages its own focus, and this must not
                // fight that.
                const target = e.target as HTMLElement;
                if (
                  !target.closest('input, textarea, button, [tabindex], [contenteditable="true"]')
                ) {
                  e.currentTarget.focus();
                }
              }}
              sx={{
                outline: 'none',
                ...(panelBesideCanvas
                  ? { width: panelWidth, flexShrink: 0 }
                  : { height: panelHeight, flexShrink: 0 }),
              }}
            >
              <Input session={session} autoFocus={false} />
            </Box>
          </Box>
        )}
      </Box>
    );
  },
);

/**
 * Canvas-first two-pane layout: Canvas on the left/top, Results on the
 * right/bottom, orientation configurable and persisted. This is the app's
 * entire arrangement - Canvas is rendered unconditionally here (not gated
 * on `session.mode`), so an auto-run's flip to `session.mode === 'result'`
 * never unmounts/remounts it (see Session.getCanvasStore() for the other
 * half of that fix).
 */
const NewLayoutView: React.FC<NewLayoutViewProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('lg'));

  const [paneWidth, setPaneWidth] = useState(DEFAULT_NEW_LAYOUT_PANE_WIDTH);
  const [paneHeight, setPaneHeight] = useState(DEFAULT_NEW_LAYOUT_PANE_HEIGHT);

  useEffect(() => {
    setPaneWidth(
      getUserPreference(STORAGE_KEYS.NEW_LAYOUT_PANE_WIDTH, DEFAULT_NEW_LAYOUT_PANE_WIDTH),
    );
    setPaneHeight(
      getUserPreference(STORAGE_KEYS.NEW_LAYOUT_PANE_HEIGHT, DEFAULT_NEW_LAYOUT_PANE_HEIGHT),
    );
  }, []);

  // Small screens always stack top-bottom, regardless of the persisted
  // preference.
  const effectiveOrientation: Orientation = isSmallScreen
    ? 'vertical'
    : global.newLayoutOrientation;
  const isHorizontal = effectiveOrientation === 'horizontal';

  // Lives on the global store (see toggle-orientation in commands.ts) so it's
  // also reachable from the command palette, not just this toolbar toggle.
  const toggleOrientation = () => global.toggleNewLayoutOrientation();

  // ReactFlow doesn't re-center the graph on its own when its container's
  // size changes (ReactFlow's own doc comment in Canvas.tsx explains why) -
  // the pane swapping from a fixed width to a fixed height (or back) leaves
  // the graph wherever the old pan/zoom put it, off-center or partly cut
  // off, until the next edit happens to trigger a fitView. Bumping this on
  // every orientation change (manual toggle or the small-screen override
  // above), on entering/exiting Zen mode (which resizes Canvas's container
  // just as drastically), or on the Pine/SQL panel opening/closing (same
  // reason - see LeftPane's panelVisible/panelBesideCanvas, which shrinks or
  // restores Canvas's share of this pane), forces that re-fit regardless of
  // which caused it.
  const [recenterRequestCount, setRecenterRequestCount] = useState(0);
  useEffect(() => {
    // Delayed past the transition, not fired immediately. Every one of
    // these causes changes Canvas's container size, and that change is now
    // ANIMATED - so an immediate fitView would measure the container at its
    // pre-animation size and leave the graph off-centre once the movement
    // actually finished. MOTION.enter is used for both directions even
    // though closing is quicker: a re-fit that lands slightly late is
    // invisible, one that lands early is the bug this guards against.
    //
    // global.showSettings is in the list even though Settings lives in
    // AppView, not here: opening it takes up to 640px away from Canvas and
    // never triggered a re-fit at all, which was a (pre-existing) bug of
    // exactly the kind the rest of this list exists to prevent.
    const timer = setTimeout(
      () => setRecenterRequestCount(c => c + 1),
      motionDuration(MOTION.enter) + 32,
    );
    return () => clearTimeout(timer);
  }, [
    effectiveOrientation,
    global.isZenModeActive,
    global.newLayoutPanelVisible,
    global.showSettings,
  ]);

  return (
    <Box
      sx={{
        my: `${NEW_LAYOUT_GUTTER}px`,
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Settings used to dock as a sibling here, but that meant it only
          showed for whichever tab happened to be active (this component
          renders per-session, once per open tab) and vanished switching
          tabs - it's now hoisted to AppView.tsx, a sibling of PineTabs
          itself, so it spans every tab instead of living inside one. */}
      {/* Zen mode used to be a separate branch of this ternary that rendered
          its own <LeftPane> without Results. That unmounted and remounted
          Canvas on every toggle - the exact thing this component's own doc
          comment above says it renders Canvas unconditionally to avoid - and
          left nothing to animate, since the old tree was gone the same frame
          the new one appeared. One tree now, with Results COLLAPSING: in
          side-by-side it hands its flex-grow to Canvas, in top/bottom its
          height goes to zero. Canvas is the same element throughout, so it
          keeps its pan/zoom across the toggle instead of re-mounting. */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: isHorizontal ? 'row' : 'column',
        }}
      >
        <Box
          data-panel-motion
          sx={{
            ...(isHorizontal
              ? {
                  width: paneWidth,
                  flexShrink: 0,
                  // Canvas only needs to GROW in Zen mode when the split is
                  // side-by-side - it's the fixed-width pane there, so
                  // without this it would stay at paneWidth with empty space
                  // where Results used to be. Top/bottom already has Canvas
                  // as the flexible pane, so it fills the gap on its own.
                  flexGrow: global.isZenModeActive ? 1 : 0,
                  height: '100%',
                }
              : { flex: 1, minHeight: 0 }),
            transition: 'flex-grow var(--motion-enter) var(--motion-ease-enter)',
          }}
        >
          <LeftPane
            sessionId={sessionId}
            isHorizontal={isHorizontal}
            onToggleOrientation={toggleOrientation}
            recenterRequestCount={recenterRequestCount}
          />
        </Box>

        {/* Results and its divider, wrapped together so they collapse as one
            (same reasoning as the Pine panel's wrapper in LeftPane above).
            The opacity runs on the SHORT duration on the way out while the
            size runs on the long one: Results is a data grid that re-lays-out
            as it narrows, and fading it first means it's already invisible by
            the time that reflow would be noticeable. */}
        <Box
          data-panel-motion
          sx={{
            display: 'flex',
            flexDirection: isHorizontal ? 'row' : 'column',
            overflow: 'hidden',
            opacity: global.isZenModeActive ? 0 : 1,
            ...(isHorizontal
              ? {
                  flexGrow: global.isZenModeActive ? 0 : 1,
                  flexBasis: 0,
                  // Without this the wrapper bottoms out at the divider's own
                  // 8px min-content width instead of disappearing.
                  minWidth: 0,
                  height: '100%',
                }
              : {
                  height: global.isZenModeActive ? 0 : paneHeight + NEW_LAYOUT_GUTTER,
                  flexShrink: 0,
                }),
            transition: global.isZenModeActive
              ? 'flex-grow var(--motion-exit) var(--motion-ease-exit), height var(--motion-exit) var(--motion-ease-exit), opacity var(--motion-fast) var(--motion-ease-exit)'
              : 'flex-grow var(--motion-enter) var(--motion-ease-enter), height var(--motion-enter) var(--motion-ease-enter), opacity var(--motion-enter) var(--motion-ease-enter)',
          }}
        >
          {isHorizontal ? (
            <NewLayoutPaneDivider paneWidth={paneWidth} setPaneWidth={setPaneWidth} />
          ) : (
            <NewLayoutHorizontalPaneDivider paneHeight={paneHeight} setPaneHeight={setPaneHeight} />
          )}

          <Box
            sx={{
              ...(isHorizontal
                ? { flex: 1, minWidth: 0, height: '100%' }
                : { height: paneHeight, flexShrink: 0 }),
            }}
          >
            <RightPane sessionId={sessionId} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
});

export default NewLayoutView;
