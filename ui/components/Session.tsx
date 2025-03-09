import {
  Box,
  Grid,
  IconButton,
  Tooltip,
  Typography,
  Divider,
  SxProps,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { observer } from 'mobx-react-lite';
import GraphBox from './Graph.box';
import Input from './Input';
import Query from './Query';
import Result from './Result';
import { useStores } from '../store/store-container';
import { Documentation } from './docs/docs';
import { Monitor } from './Monitor';
import { AccountTree, BarChart, TableChart, MoreVert, Description } from '@mui/icons-material';
import { Session as SessionType } from '../store/session';
import { useState, useEffect } from 'react';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from '../store/preferences';
import { MIN_SIDEBAR_WIDTH, DEFAULT_SIDEBAR_WIDTH } from '../constants';

interface SessionProps {
  sessionId: string;
}

const Sidebar = ({ session, sx }: { session: SessionType; sx: SxProps }) => {
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
    <Box sx={sx}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
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

        <Tooltip title="Documentation">
          <IconButton size="small" onClick={() => (session.mode = 'documentation')}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Description
                sx={{ color: session.mode === 'documentation' ? highlightColor : defaultColor }}
              />
            </Box>
          </IconButton>
        </Tooltip>
        <Tooltip title="Visualize Relations">
          <IconButton size="small" onClick={() => (session.mode = 'graph')}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <AccountTree
                sx={{ color: session.mode === 'graph' ? highlightColor : defaultColor }}
              />
            </Box>
          </IconButton>
        </Tooltip>
        <Tooltip title="Results">
          <IconButton size="small" onClick={() => (session.mode = 'result')}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <TableChart
                sx={{ color: session.mode === 'result' ? highlightColor : defaultColor }}
              />
            </Box>
          </IconButton>
        </Tooltip>
        <Tooltip title="More options">
          <IconButton size="small" onClick={handleMenuOpen}>
            <MoreVert />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Input sessionId={session.id} />
      </Box>
      <Box sx={{ border: '1px solid lightgray', borderRadius: 1, mt: 1 }}>
        <Query sessionId={session.id} />
      </Box>
    </Box>
  );
};

const MainView = ({
  sessionId,
  mode,
  input,
}: {
  sessionId: string;
  mode: string;
  input: boolean;
}) => (
  <Box sx={{ flex: 1 }}>
    {(() => {
      switch (mode) {
        case 'monitor':
          return <Monitor sessionId={sessionId} />;
        case 'result':
          return <Result sessionId={sessionId} />;
        case 'graph':
          return (
            <Box
              className={input ? 'unfocussed' : 'focussed'}
              sx={{
                borderRadius: 1,
                height: 'calc(100vh - 122px)',
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
        ...(isResizing && {
          backgroundColor: 'lightgray',
          width: '10px',
          opacity: 1,
        }),
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

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  useEffect(() => {
    const storedWidth = getUserPreference(STORAGE_KEYS.SIDEBAR_WIDTH, DEFAULT_SIDEBAR_WIDTH);
    setSidebarWidth(storedWidth);
  }, []);

  return (
    <Grid container>
      <Grid
        container
        sx={{
          mt: 2,
          height: 'calc(100vh - 122px)',
        }}
      >
        <Grid item style={{ width: sidebarWidth, position: 'relative' }}>
          <Sidebar session={session} sx={{ mr: '10px' }} />
          <ResizableDivider sidebarWidth={sidebarWidth} setSidebarWidth={setSidebarWidth} />
        </Grid>

        <Grid item style={{ width: `calc(100% - ${sidebarWidth}px)` }}>
          <MainView sessionId={sessionId} mode={session.mode} input={session.input} />
        </Grid>
      </Grid>
    </Grid>
  );
});

export default Session;
