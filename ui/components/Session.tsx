import { Box, Grid, Typography, useMediaQuery, useTheme } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import {
  DEFAULT_SIDEBAR_WIDTH,
  DEFAULT_SIDEBAR_SECOND_VIEW_HEIGHT,
  getSecondaryViewHeight,
  MIN_SIDEBAR_INPUT_HEIGHT,
  MIN_SIDEBAR_SECOND_VIEW_HEIGHT,
} from '../constants';
import { getUserPreference, STORAGE_KEYS } from '../store/preferences';
import { ResizableDivider, ResizableHorizontalDivider } from './ResizableDividers';
import { Mode, Session as SessionType } from '../store/session';
import { GlobalStore } from '../store/global.store';
import { useStores } from '../store/store-container';
import { Documentation } from './docs/docs';
import GraphBox from './Graph.box';
import Canvas from './canvas/Canvas';
import Input from './Input';
import { Monitor } from './Monitor';
import NewLayoutView from './NewLayoutView';
import Query from './Query';
import Result from './Result';
import ErrorMessage from './ErrorMessage';

interface SessionProps {
  sessionId: string;
}

const Sidebar = ({
  session,
  firstView,
  secondView,
  secondViewHeight,
  setSecondViewHeight,
}: {
  session: SessionType;
  firstView: React.ReactNode;
  secondView: React.ReactNode;
  secondViewHeight?: number;
  setSecondViewHeight?: (height: number) => void;
}) => {
  const isResizable = secondViewHeight !== undefined && setSecondViewHeight !== undefined;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        mr: 1,
        height: '100%',
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: MIN_SIDEBAR_INPUT_HEIGHT,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {firstView}
      </Box>
      {isResizable ? (
        <>
          <ResizableHorizontalDivider
            secondViewHeight={secondViewHeight!}
            setSecondViewHeight={setSecondViewHeight!}
          />
          <Box
            sx={{
              border: '1px solid var(--border-color)',
              borderRadius: 1,
              height: secondViewHeight,
              minHeight: MIN_SIDEBAR_SECOND_VIEW_HEIGHT,
              // A persisted secondViewHeight (dragged large in a taller
              // window, or before the sidebar's own available height
              // shrank for any other reason) is otherwise applied as-is
              // with flexShrink:0 - nothing previously stopped it from
              // demanding more room than the Sidebar actually has, which
              // overflowed this column and (via the outer Grid's default
              // align-items:stretch) stretched the sibling graph/results
              // column to match, showing up as "the graph has a scrollbar"
              // even though the real overflow originates here. Capping it
              // in CSS against the Sidebar's own 100% height - not a fixed
              // pixel guess - keeps firstView's own MIN_SIDEBAR_INPUT_HEIGHT
              // and the 10px divider always available regardless of
              // viewport size.
              maxHeight: `calc(100% - ${MIN_SIDEBAR_INPUT_HEIGHT}px - 10px)`,
              overflow: 'auto',
              flexShrink: 0,
            }}
          >
            {secondView}
          </Box>
        </>
      ) : (
        <Box
          sx={{
            border: '1px solid var(--border-color)',
            borderRadius: 1,
            mt: 1,
            height: getSecondaryViewHeight(),
            overflow: 'auto',
          }}
        >
          {secondView}
        </Box>
      )}
    </Box>
  );
};

/**
 * Legacy Layout's own graph-editor switcher, between Graph mode (the
 * classic, non-editable node diagram - GraphBox.tsx) and Canvas mode (the
 * point-and-click editor - Canvas.tsx). Lives inside the graph/canvas widget
 * itself (MainView's graph-panel box, bottom-right - GraphBox's own
 * fullscreen icon already claims top-right, Canvas's own toolbar claims
 * top-left), not the app header, so it never appears alongside the
 * header's layout switcher (AppView.tsx's LayoutSwitcher) and reads as
 * "a setting of this widget" rather than a second, confusingly similar
 * global toggle. Only rendered here, which is LegacySessionView-only -
 * New Layout is Canvas-only and has no equivalent choice to offer.
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
        ← Switch to Graph mode
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
      Switch to Canvas mode
    </Box>
  );
});

// Reads global.canvasModeEnabled directly (rather than only receiving
// pre-computed booleans as props) - must be its own observer, not just a
// plain function called from Session's render. MobX only establishes a
// reactive subscription where a tracked observable is actually *read*;
// passing the `global` store reference down as a prop doesn't count as a
// read, so without this, toggling canvas mode updated the store (confirmed:
// localStorage changed) but nothing on screen ever re-rendered to reflect it.
const MainView = observer(
  ({
    sessionId,
    mode,
    input,
    height,
    global,
  }: {
    sessionId: string;
    mode: Mode;
    input: boolean;
    height: string;
    global: GlobalStore;
  }) => {
    // The graph/canvas switcher belongs to this widget regardless of
    // whether it's showing a populated graph or the empty-state "Welcome"
    // intro (mode 'documentation' with canvas off) - both are still "this
    // is the graph/canvas widget", just with nothing drawn yet. Keeping the
    // switcher outside the inner switch (rather than only inside the
    // populated-graph branch) is what makes it reachable from a fresh,
    // empty session too, not just after typing/building something.
    const showGraphModeSwitcher = mode === 'graph' || mode === 'documentation';
    // position:'relative' only while the switcher itself is shown (i.e.
    // only for the graph/documentation case) - Result.tsx positions its own
    // download/chart icons at top:-40 relative to whichever ancestor box
    // is the nearest positioned one, and unconditionally making THIS box
    // that ancestor for the 'result' case too (rather than leaving it
    // static, as before) pushed those icons up into space this box doesn't
    // have slack for, which showed up as an unwanted scrollbar in Legacy
    // Layout.
    return (
      <Box
        sx={{
          position: showGraphModeSwitcher ? 'relative' : undefined,
          flex: 1,
          minHeight: 0,
          height: '100%',
        }}
      >
        {(() => {
          switch (mode) {
            case 'monitor':
              return <Monitor sessionId={sessionId} height={height} />;
            case 'result':
              return <Result sessionId={sessionId} />;
            case 'graph':
            case 'documentation':
              // 'documentation' is just "nothing typed yet" (see store/session.ts) - normally
              // that means show the intro docs, since the classic graph has nothing to draw for
              // an empty expression either. Canvas mode is the exception: its start node ("pick
              // a table") *is* the meaningful empty state, so canvas stays on screen instead of
              // being replaced by the intro the moment the expression is cleared.
              if (mode === 'documentation' && !global.canvasModeEnabled) {
                return Documentation;
              }
              return (
                <Box
                  className={input ? 'unfocussed' : 'focussed'}
                  sx={{
                    position: 'relative',
                    borderRadius: 1,
                    height,
                    overflow: 'hidden',
                    backgroundColor: 'var(--graph-background)',
                  }}
                >
                  {global.canvasModeEnabled ? (
                    <Canvas sessionId={sessionId} />
                  ) : (
                    <GraphBox sessionId={sessionId} />
                  )}
                </Box>
              );
            default:
              return Documentation;
          }
        })()}
        {showGraphModeSwitcher && (
          <Box sx={{ position: 'absolute', bottom: 10, right: 10, zIndex: 10 }}>
            <InteractiveViewToggle global={global} />
          </Box>
        )}
      </Box>
    );
  },
);

const Session: React.FC<SessionProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  return global.layoutMode === 'new' ? (
    <NewLayoutView sessionId={sessionId} />
  ) : (
    <LegacySessionView sessionId={sessionId} />
  );
});

const LegacySessionView: React.FC<SessionProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('lg'));

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [secondViewHeight, setSecondViewHeight] = useState(DEFAULT_SIDEBAR_SECOND_VIEW_HEIGHT);

  useEffect(() => {
    const storedWidth = getUserPreference(STORAGE_KEYS.SIDEBAR_WIDTH, DEFAULT_SIDEBAR_WIDTH);
    setSidebarWidth(storedWidth);
  }, []);

  useEffect(() => {
    const storedHeight = getUserPreference(
      STORAGE_KEYS.SIDEBAR_SECOND_VIEW_HEIGHT,
      DEFAULT_SIDEBAR_SECOND_VIEW_HEIGHT,
    );
    setSecondViewHeight(storedHeight);
  }, []);

  const compactMode = isSmallScreen;

  return (
    <Grid
      container
      sx={{
        mt: 1,
        flex: 1,
        minHeight: 0,
      }}
    >
      {!compactMode && (
        <>
          <Grid item style={{ width: sidebarWidth, position: 'relative', height: '100%' }}>
            <Sidebar
              session={session}
              firstView={<Input session={session} />}
              secondView={
                session.error ? (
                  <ErrorMessage />
                ) : session.mode === 'result' ? (
                  // This mini graph preview (shown while the main panel is
                  // displaying results, not the query) was hardcoded to the
                  // classic graph regardless of the interactive-view
                  // preference - the one place that preference didn't reach.
                  global.canvasModeEnabled ? (
                    <Canvas sessionId={sessionId} />
                  ) : (
                    <GraphBox sessionId={sessionId} />
                  )
                ) : (
                  <Query sessionId={sessionId} />
                )
              }
              secondViewHeight={secondViewHeight}
              setSecondViewHeight={setSecondViewHeight}
            />
            <ResizableDivider sidebarWidth={sidebarWidth} setSidebarWidth={setSidebarWidth} />
          </Grid>

          <Grid
            item
            style={{ width: `calc(100% - ${sidebarWidth}px)`, minHeight: 0 }}
            sx={{ display: 'flex', flexDirection: 'column' }}
          >
            {
              <MainView
                sessionId={sessionId}
                mode={session.mode}
                input={session.textInputFocused}
                height="100%"
                global={global}
              />
            }
          </Grid>
        </>
      )}

      {compactMode && (
        <Grid item xs={12} sx={{ flexGrow: 1, width: 'max-content' }}>
          <Sidebar
            session={session}
            firstView={<Input session={session} />}
            secondView={
              <MainView
                sessionId={sessionId}
                mode={session.mode}
                input={session.textInputFocused}
                height={`${secondViewHeight}px`}
                global={global}
              />
            }
            secondViewHeight={secondViewHeight}
            setSecondViewHeight={setSecondViewHeight}
          />
        </Grid>
      )}
    </Grid>
  );
});

export default Session;
