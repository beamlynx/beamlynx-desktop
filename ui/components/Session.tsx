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

const Session: React.FC<SessionProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);

  return (
    <Box sx={{ mt: 2 }}>
      <Grid container>
        <Grid item xs={5}>
          <Input sessionId={sessionId} />
        </Grid>
        <Grid item xs={6}>
          <Query sessionId={sessionId} />
        </Grid>
      </Grid>
      <Box sx={{ mt: 1 }}>
        <Result sessionId={sessionId} />
      </Box>

      {/* Only show the graph if the expression isn't executed i.e. results are not loaded */}
      {!session.loaded && (
        <Box
          className={session.mode === 'graph' ? 'focussed' : 'unfocussed'}
          sx={{
            borderRadius: 1,
            // Unable to use flex to maximuze the height of the graph
            // Falling back on hardcoded height
            height: 'calc(100vh - 330px)',
            overflow: 'hidden',
          }}
        >
          {session.expression ? <GraphBox sessionId={sessionId} /> : Documentation}
        </Box>
      )}
    </Box>
  );
});

export default Session;
