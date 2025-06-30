import { Box, Grid, Typography, IconButton, Menu, MenuItem } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import PineTabs from './PineTabs';
import { RunPineServer } from './docs/RunPineServer';
import ActiveConnection from './ActiveConnection';
import Message from './Message';
import UserBox from './UserBox';
import { isDevelopment } from '../store/util';
import { Brightness4, Brightness7, Settings } from '@mui/icons-material';
import { useState } from 'react';

const UserContent = isDevelopment ? (
  <Typography variant="caption" color="gray">
    Dev Mode
  </Typography>
) : (
  <UserBox />
);

const AppView = observer(() => {
  const { global } = useStores();
  const session = global.getSession(global.activeSessionId);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  if (global.connecting) {
    return (
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Typography className="text-primary">Connecting...</Typography>
      </Box>
    );
  }

  if (!global.connected) {
    return (
      <Box
        sx={{
          p: 2,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          animation: 'fadeIn 0.5s ease-in',
          '@keyframes fadeIn': {
            '0%': {
              opacity: 0,
            },
            '100%': {
              opacity: 1,
            },
          },
        }}
      >
        <RunPineServer />
      </Box>
    );
  }

  return (
    <>
      <Grid container>
        <Grid item xs={3}>
          <Box sx={{ m: 2, mt: 1 }}>
            <ActiveConnection />
          </Box>
        </Grid>

        <Grid item xs={8}>
          <Box sx={{ m: 1 }}>
            <Message />
          </Box>
        </Grid>

        <Grid item xs={1}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            {UserContent}
            <IconButton onClick={handleMenuOpen} sx={{ ml: 1 }} color="inherit">
              <Settings />
            </IconButton>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
              <MenuItem onClick={() => session.toggleTheme()}>
                {session.theme === 'dark' ? <Brightness7 sx={{mr:1}} /> : <Brightness4 sx={{mr:1}} />}
                Toggle Theme
              </MenuItem>
              <MenuItem onClick={() => session.toggleVimMode()}>
                {session.vimMode ? <Box sx={{mr:1, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>ON</Box> : <Box sx={{mr:1, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>OFF</Box>}
                Vim Mode
              </MenuItem>
            </Menu>
          </Box>
        </Grid>
      </Grid>

      <Box sx={{ m: 1, display: 'flex', flexDirection: 'column' }}>
        <PineTabs></PineTabs>
      </Box>
    </>
  );
});

export default AppView;
