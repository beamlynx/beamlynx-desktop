import { Box, Divider, Grid, useMediaQuery, useTheme } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import {
  DEFAULT_SIDEBAR_WIDTH,
  getSecondaryViewHeight,
  getTabHeight,
  MIN_SIDEBAR_WIDTH,
} from '../constants';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from '../store/preferences';
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
}: {
  session: SessionType;
  firstView: React.ReactNode;
  secondView: React.ReactNode;
}) => {
  return (
    <Box sx={{ flex: 1, mr: 1, flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          alignItems: 'center',
          mb: 1,
        }}
      >
        {firstView}
      </Box>
      <Box
        sx={{
          border: '1px solid var(--border-color)',
          borderRadius: 1,
          mt: 1,
          height: getSecondaryViewHeight(),
        }}
      >
        {secondView}
      </Box>
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

const ResizableDivider = ({
  sidebarWidth,
  setSidebarWidth,
}: {
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
}) => {
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);

    const startX = e.pageX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = startWidth + e.pageX - startX;
      const constrainedWidth = Math.min(
        Math.max(newWidth, MIN_SIDEBAR_WIDTH),
        window.innerWidth * 0.5,
      );
      setSidebarWidth(constrainedWidth);
      setUserPreference(STORAGE_KEYS.SIDEBAR_WIDTH, constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <Divider
      orientation="vertical"
      sx={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        cursor: 'col-resize',
        width: '10px',
        opacity: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        '&:hover': {
          backgroundColor: 'action.hover',
          transition: 'background-color 0.2s',
          opacity: 1,
        },
      }}
      onMouseDown={handleMouseDown}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <Box
          sx={{
            width: '4px',
            height: '24px',
            backgroundColor: 'var(--divider-color)',
            borderRadius: '2px',
          }}
        />
      </Box>
    </Divider>
  );
};

const Session: React.FC<SessionProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('lg'));

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  useEffect(() => {
    const storedWidth = getUserPreference(STORAGE_KEYS.SIDEBAR_WIDTH, DEFAULT_SIDEBAR_WIDTH);
    setSidebarWidth(storedWidth);
  }, []);

  const compactMode = isSmallScreen || global.forceCompactMode;

  return (
    <Grid
      container
      sx={{
        mt: 1,
      }}
    >
      {!compactMode && (
        <>
          <Grid item style={{ width: sidebarWidth, position: 'relative' }}>
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
                height={getSecondaryViewHeight()}
              />
            }
          />
        </Grid>
      )}
    </Grid>
  );
});

export default Session;
