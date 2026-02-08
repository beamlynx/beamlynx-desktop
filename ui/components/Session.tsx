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
import { useStores } from '../store/store-container';
import { Documentation } from './docs/docs';
import GraphBox from './Graph.box';
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

const MainView = ({
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
    <Box sx={{ flex: 1 }}>
      {(() => {
        switch (mode) {
          case 'monitor':
            return <Monitor sessionId={sessionId} height={height} />;
          case 'result':
            return <Result sessionId={sessionId} />;
          case 'graph':
            return (
              <Box
                className={input ? 'unfocussed' : 'focussed'}
                sx={{
                  borderRadius: 1,
                  height,
                  overflow: 'hidden',
                  backgroundColor: 'var(--graph-background)',
                }}
              >
                <GraphBox sessionId={sessionId} />
              </Box>
            );
          case 'documentation':
          // intentional fall through
          default:
            return Documentation;
        }
      })()}
    </Box>
  );
};

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
                  <GraphBox sessionId={sessionId} />
                ) : (
                  <Query sessionId={sessionId} />
                )
              }
              secondViewHeight={secondViewHeight}
              setSecondViewHeight={setSecondViewHeight}
            />
            <ResizableDivider sidebarWidth={sidebarWidth} setSidebarWidth={setSidebarWidth} />
          </Grid>

          <Grid item style={{ width: `calc(100% - ${sidebarWidth}px)` }}>
            {
              <MainView
                sessionId={sessionId}
                mode={session.mode}
                input={session.textInputFocused}
                height={getTabHeight()}
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
