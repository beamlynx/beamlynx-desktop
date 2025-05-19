import {
  AccountTree,
  BarChart,
  Description,
  MoreVert,
  TableChart
} from '@mui/icons-material';
import {
  Box,
  Divider,
  Grid,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { DEFAULT_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from '../constants';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from '../store/preferences';
import { Mode, Session as SessionType } from '../store/session';
import { useStores } from '../store/store-container';
import { Documentation } from './docs/docs';
import GraphBox from './Graph.box';
import Input from './Input';
import { Monitor } from './Monitor';
import Query from './Query';
import Result from './Result';

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
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const highlightColor = '#4caf50';
  const defaultColor = '#9e9e9e';

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <Box sx={{ height: '100%' }}>
      <Box sx={{ display: 'flex', flexDirection: 'row', height: '100%' }}>
        {/* Left column: Input and Query */}
        <Box sx={{ flex: 1, mr: 1, flexDirection: 'column', height: '100%' }}>
          <Box sx={{ alignItems: 'center', mb: 1 }}>{firstView}</Box>
          <Box
            sx={{
              border: '1px solid lightgray',
              borderRadius: 1,
              mt: 2,
            }}
          >
            {secondView}
          </Box>
        </Box>

        {/* Right column: Icons */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            mr: 1,
            width: 'auto',
          }}
        >
          <Tooltip title="Documentation">
            <IconButton size="small" onClick={() => (session.mode = 'documentation')}>
              <Description
                sx={{ color: session.mode === 'documentation' ? highlightColor : defaultColor }}
              />
            </IconButton>
          </Tooltip>

          <Tooltip title="Visualize Relations">
            <IconButton size="small" onClick={() => (session.mode = 'graph')}>
              <AccountTree
                sx={{ color: session.mode === 'graph' ? highlightColor : defaultColor }}
              />
            </IconButton>
          </Tooltip>

          <Tooltip title="Results">
            <IconButton size="small" onClick={() => (session.mode = 'result')}>
              <TableChart
                sx={{ color: session.mode === 'result' ? highlightColor : defaultColor }}
              />
            </IconButton>
          </Tooltip>

          <Tooltip title="More options">
            <IconButton size="small" onClick={handleMenuOpen}>
              <MoreVert />
            </IconButton>
          </Tooltip>

          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
            <MenuItem
              onClick={() => {
                if (session.mode === 'monitor') return;
                session.mode = 'monitor';
                handleMenuClose();
              }}
            >
              <ListItemIcon>
                <BarChart
                  sx={{ color: session.mode === 'monitor' ? highlightColor : defaultColor }}
                />
              </ListItemIcon>
              <ListItemText primary="Connection monitoring" />
            </MenuItem>
          </Menu>
        </Box>
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
            backgroundColor: 'gray',
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

  return (
    <Grid
      container
      sx={{
        mt: 2,
      }}
    >
      {!isSmallScreen && (
        <>
          <Grid item style={{ width: sidebarWidth, position: 'relative' }}>
            <Sidebar
              session={session}
              firstView={<Input sessionId={sessionId} />}
              secondView={<Query sessionId={sessionId} />}
            />
            <ResizableDivider sidebarWidth={sidebarWidth} setSidebarWidth={setSidebarWidth} />
          </Grid>

          <Grid item style={{ width: `calc(100% - ${sidebarWidth}px)` }}>
            {
              <MainView
                sessionId={sessionId}
                mode={session.mode}
                input={session.textInputFocused}
                height="calc(100vh - 126px)"
              />
            }
          </Grid>
        </>
      )}

      {isSmallScreen && (
        <Grid item xs={12} sx={{ flexGrow: 1, width: 'max-content' }}>
          <Sidebar
            session={session}
            firstView={<Input sessionId={sessionId} />}
            secondView={
              <MainView
                sessionId={sessionId}
                mode={session.mode}
                input={session.textInputFocused}
                height="calc(100vh - 366px)"
              />
            }
          />
        </Grid>
      )}
    </Grid>
  );
});

export default Session;
