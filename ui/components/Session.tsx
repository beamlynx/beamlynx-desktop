import { Box, Grid, useMediaQuery, useTheme } from '@mui/material';
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
import { useStores } from '../store/store-container';
import Canvas from './canvas/Canvas';
import Input from './Input';
import { Monitor } from './Monitor';
import NewLayoutView from './NewLayoutView';
import Query from './Query';
import Result from './Result';
import ErrorMessage from './ErrorMessage';
import RevealRequestBanner from './RevealRequestBanner';

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

const MainView = observer(
  ({
    sessionId,
    mode,
    input,
    height,
  }: {
    sessionId: string;
    mode: Mode;
    input: boolean;
    height: string;
  }) => {
    return (
      <Box
        sx={{
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
              // Canvas is the only graph editor now (the classic node-graph
              // widget, GraphBox, was removed) - its start node ("pick a
              // table") is a meaningful empty state on its own, so 'graph'
              // and 'documentation' (just "nothing typed yet", see
              // store/session.ts) render identically.
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
                  <Canvas sessionId={sessionId} />
                </Box>
              );
          }
        })()}
      </Box>
    );
  },
);

const Session: React.FC<SessionProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 }}>
      {session.pendingRevealRequestId && <RevealRequestBanner session={session} />}
      {/* Same flex-column/flex:1/minHeight:0 combination PineTabs' TabPanel
          already gives this component directly -- kept identical here so
          NewLayoutView/LegacySessionView (each already relying on that
          exact parent shape for their own internal sizing) render under an
          equivalent box, with the banner above just taking its own space
          out of the column first. flexDirection must stay 'column': a bare
          display:'flex' defaults to row, which would hand both layout
          views a horizontal main axis instead of the vertical one they're
          built for. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 }}>
        {global.layoutMode === 'new' ? (
          <NewLayoutView sessionId={sessionId} />
        ) : (
          <LegacySessionView sessionId={sessionId} />
        )}
      </Box>
    </Box>
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
                  <Canvas sessionId={sessionId} />
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
