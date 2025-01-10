import { Box, Grid } from '@mui/material';
import { observer } from 'mobx-react-lite';
import GraphBox from './Graph.box';
import Input from './Input';
import Query from './Query';
import Result from './Result';
import { useStores } from '../store/store-container';
import { Documentation } from './docs/docs';

interface SessionProps {
  sessionId: string;
}

const Sidebar = ({ sessionId }: { sessionId: string }) => (
  <Box
    sx={{
      height: '100%',
    }}
  >
    <Input sessionId={sessionId} />
    <Box sx={{ border: '1px solid lightgray', borderRadius: 1, mt: 1 }}>
      <Query sessionId={sessionId} />
    </Box>
  </Box>
);

const MainView = ({
  sessionId,
  session,
  loaded,
  expression,
  mode,
}: {
  sessionId: string;
  session: any;
  loaded: boolean;
  expression: string;
  mode: string;
}) => (
  <Box sx={{ flex: 1, ml: 1 }}>
    {!expression ? (
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
        <Grid item xs={2}>
          <Sidebar sessionId={sessionId} />
        </Grid>
        <Grid item xs={10}>
          <MainView
            sessionId={sessionId}
            session={session}
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
