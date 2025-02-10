import { Box, Grid, IconButton, Tooltip, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import GraphBox from './Graph.box';
import Input from './Input';
import Query from './Query';
import Result from './Result';
import { useStores } from '../store/store-container';
import { Documentation } from './docs/docs';
import { Monitor } from './Monitor';
import { BarChart } from '@mui/icons-material';
import { Session as SessionType } from '../store/session';

interface SessionProps {
  sessionId: string;
}

const Sidebar = ({ session }: { session: SessionType }) => {
  return (
    <Box
      sx={{
        height: '100%',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Tooltip
          title={`${session.mode === 'monitor' ? 'Disable' : 'Enable'} connection monitoring`}
        >
          <IconButton
            size="small"
            onClick={() => (session.mode = session.mode === 'monitor' ? 'none' : 'monitor')}
          >
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <BarChart sx={{ color: session.mode === 'monitor' ? '#4caf50' : '#9e9e9e' }} />
            </Box>
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
  loaded,
  expression,
  mode,
}: {
  sessionId: string;
  loaded: boolean;
  expression: string;
  mode: string;
}) => (
  <Box sx={{ flex: 1, ml: 1 }}>
    {mode === 'monitor' ? (
      <Monitor sessionId={sessionId} />
    ) : !expression ? (
      Documentation
    ) : loaded ? (
      <Result sessionId={sessionId} />
    ) : (
      <Box
        className={mode === 'graph' ? 'focussed' : 'unfocussed'}
        sx={{
          borderRadius: 1,
          height: 'calc(100vh - 122px)',
          overflow: 'hidden',
        }}
      >
        <GraphBox sessionId={sessionId} />
      </Box>
    )}
  </Box>
);

const Session: React.FC<SessionProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);

  return (
    <Grid container>
      <Grid container sx={{ mt: 2, height: 'calc(100vh - 122px)' }}>
        <Grid item xs={4} md={3} lg={2}>
          <Sidebar session={session} />
        </Grid>

        <Grid item xs={8} md={9} lg={10}>
          <MainView
            sessionId={sessionId}
            loaded={session.loaded}
            expression={session.expression}
            mode={session.mode}
          />
        </Grid>
      </Grid>
    </Grid>
  );
});

export default Session;
