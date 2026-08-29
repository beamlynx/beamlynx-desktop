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
import { getUserPreference, setUserPreference, STORAGE_KEYS } from '../store/preferences';
import { useStores } from '../store/store-container';
import Canvas from './canvas/Canvas';
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
 * failed. Legacy surfaces `session.error` inside the sidebar (see
 * Session.tsx); New Layout's plain Canvas|Results split has no other slot
 * for it, and auto-run makes execution failures (a query that parses fine
 * but fails at the DB) a routine occurrence here, not a corner case.
 *
 * Also handles `session.mode === 'monitor'` (see the `toggle-connection-monitor`
 * command) for parity with Legacy, which has no dedicated pane for it either.
 */
const RightPane = observer(({ sessionId }: { sessionId: string }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);

  if (session.mode === 'monitor') {
    return <Monitor sessionId={sessionId} height="100%" />;
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {session.error && (
        <Box sx={{ flexShrink: 0 }}>
          <ErrorMessage />
        </Box>
      )}
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
    // Only when the outer split is top/bottom - see the doc comment above.
    const panelBesideCanvas = panelVisible && !isHorizontal;

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
            if (
              !target.closest('input, textarea, button, [tabindex], [contenteditable="true"]')
            ) {
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
          {!panelVisible && (
            <Box sx={{ position: 'absolute', bottom: 8, right: 8, zIndex: 20 }}>
              <RunButton session={session} />
            </Box>
          )}
        </Box>
        {panelVisible &&
          (panelBesideCanvas ? (
            <NewLayoutPanelDivider panelWidth={panelWidth} setPanelWidth={setPanelWidth} />
          ) : (
            <NewLayoutHorizontalPanelDivider
              panelHeight={panelHeight}
              setPanelHeight={setPanelHeight}
            />
          ))}
        {panelVisible && (
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
        )}
      </Box>
    );
  },
);

/**
 * Canvas-first two-pane layout: Canvas on the left/top, Results on the
 * right/bottom, orientation configurable and persisted. This is New Layout's
 * entire arrangement - unlike Legacy's Session/MainView, Canvas is rendered
 * unconditionally here (not gated on `session.mode`), so an auto-run's flip
 * to `session.mode === 'result'` never unmounts/remounts it (see
 * Session.getCanvasStore() for the other half of that fix).
 */
const NewLayoutView: React.FC<NewLayoutViewProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('lg'));

  const [orientation, setOrientation] = useState<Orientation>('horizontal');
  const [paneWidth, setPaneWidth] = useState(DEFAULT_NEW_LAYOUT_PANE_WIDTH);
  const [paneHeight, setPaneHeight] = useState(DEFAULT_NEW_LAYOUT_PANE_HEIGHT);

  useEffect(() => {
    setOrientation(getUserPreference(STORAGE_KEYS.NEW_LAYOUT_ORIENTATION, 'horizontal'));
    setPaneWidth(
      getUserPreference(STORAGE_KEYS.NEW_LAYOUT_PANE_WIDTH, DEFAULT_NEW_LAYOUT_PANE_WIDTH),
    );
    setPaneHeight(
      getUserPreference(STORAGE_KEYS.NEW_LAYOUT_PANE_HEIGHT, DEFAULT_NEW_LAYOUT_PANE_HEIGHT),
    );
  }, []);

  // Small screens always stack top-bottom, regardless of the persisted
  // preference - the same override `compactMode` applies in Legacy Layout.
  const effectiveOrientation: Orientation = isSmallScreen ? 'vertical' : orientation;
  const isHorizontal = effectiveOrientation === 'horizontal';

  const toggleOrientation = () => {
    const next: Orientation = isHorizontal ? 'vertical' : 'horizontal';
    setOrientation(next);
    setUserPreference(STORAGE_KEYS.NEW_LAYOUT_ORIENTATION, next);
  };

  // ReactFlow doesn't re-center the graph on its own when its container's
  // size changes (ReactFlow's own doc comment in Canvas.tsx explains why) -
  // the pane swapping from a fixed width to a fixed height (or back) leaves
  // the graph wherever the old pan/zoom put it, off-center or partly cut
  // off, until the next edit happens to trigger a fitView. Bumping this on
  // every orientation change (manual toggle or the small-screen override
  // above), or on entering/exiting Zen mode (which resizes Canvas's
  // container just as drastically), forces that re-fit regardless of which
  // caused it.
  const [recenterRequestCount, setRecenterRequestCount] = useState(0);
  useEffect(() => {
    setRecenterRequestCount(c => c + 1);
  }, [effectiveOrientation, global.isZenModeActive]);

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
      {global.isZenModeActive ? (
        // Zen mode: Results (and its divider) aren't just narrowed, they're
        // gone entirely - Canvas takes the whole row.
        <Box sx={{ flex: 1, minWidth: 0, height: '100%' }}>
          <LeftPane
            sessionId={sessionId}
            isHorizontal={isHorizontal}
            onToggleOrientation={toggleOrientation}
            recenterRequestCount={recenterRequestCount}
          />
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: isHorizontal ? 'row' : 'column',
          }}
        >
          <Box
            sx={{
              ...(isHorizontal ? { width: paneWidth, flexShrink: 0 } : { flex: 1, minHeight: 0 }),
              height: isHorizontal ? '100%' : undefined,
            }}
          >
            <LeftPane
              sessionId={sessionId}
              isHorizontal={isHorizontal}
              onToggleOrientation={toggleOrientation}
              recenterRequestCount={recenterRequestCount}
            />
          </Box>

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
      )}
    </Box>
  );
});

export default NewLayoutView;
