import { Box, Grid, useMediaQuery, useTheme } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import {
  DEFAULT_SIDEBAR_WIDTH,
  DEFAULT_SIDEBAR_SECOND_VIEW_HEIGHT,
  getSecondaryViewHeight,
  getTabHeight,
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
 * Cross-links the two graph experiences - canvas mode is a global preference
 * (global.canvasModeEnabled, like theme), not a per-session toggle, so every
 * tab's 'graph' view switches together. Whichever one isn't currently
 * showing gets a one-line, one-click way back to the other, rather than
 * requiring the command palette. Bottom-right (not bottom-left, its first
 * placement) - that's the conventional corner for an opt-in/beta nudge
 * (feedback widgets, "what's new" pills), and keeps it away from the editor
 * panel, which sits at the left edge of this same view.
 */
const GraphExperienceBanner = ({
  usingCanvas,
  global,
}: {
  usingCanvas: boolean;
  global: GlobalStore;
}) => (
  <Box
    onClick={() => global.toggleCanvasMode()}
    sx={{
      position: 'absolute',
      bottom: 8,
      right: 8,
      zIndex: 10,
      padding: '3px 10px',
      borderRadius: 1,
      fontSize: 12,
      cursor: 'pointer',
      color: 'var(--primary-color)',
      background: 'var(--node-bg)',
      // No border - in light mode --border-color and --node-bg are the same
      // gray, so a border here was invisible and the banner read as a
      // washed-out blob with no edge. A shadow gives it definition in both
      // themes without depending on a border/background contrast that only
      // happens to work in one of them.
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    }}
  >
    {usingCanvas ? '← Back to the classic view' : 'Try the new interactive view (experimental) →'}
  </Box>
);

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
    return (
      <Box sx={{ flex: 1, minHeight: 0, height: '100%' }}>
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
                  <GraphExperienceBanner usingCanvas={global.canvasModeEnabled} global={global} />
                </Box>
              );
            default:
              return Documentation;
          }
        })()}
      </Box>
    );
  },
);

const Session: React.FC<SessionProps> = observer(({ sessionId }) => {
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

  const compactMode = isSmallScreen || global.forceCompactMode;

  return (
    <Grid
      container
      sx={{
        mt: 1,
        height: getTabHeight(),
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
                height={getTabHeight()}
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
