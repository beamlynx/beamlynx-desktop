import { Box, Grid, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import PineTabs from './PineTabs';
import { RunPineServer } from './docs/RunPineServer';
import ActiveConnection from './ActiveConnection';
import Message from './Message';
import UserBox from './UserBox';
import { isDevelopment } from '../store/util';
const UserContent = isDevelopment ? (
  <Typography variant="caption" color="gray">
    Dev Mode
  </Typography>
) : (
  <UserBox />
);

const AppView = observer(() => {
  const { global } = useStores();

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
          {UserContent}
        </Grid>
      </Grid>

      <Box sx={{ m: 1, display: 'flex', flexDirection: 'column' }}>
        <PineTabs></PineTabs>
      </Box>
    </>
  );
});

export default AppView;
