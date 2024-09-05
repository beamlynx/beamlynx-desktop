import { Box, Grid } from '@mui/material';
import { observer } from 'mobx-react-lite';
import GraphBox from './Graph.box';
import Input from './Input';
import Query from './Query';
import Result from './Result';
import { useStores } from '../store/store-container';
import { Documentation } from './docs/docs';

const Session = observer(() => {
  const { global } = useStores();
  return (
    <Box sx={{ mt: 2 }}>
      <Grid container>
        <Grid item xs={5}>
          <Input />
        </Grid>
        <Grid item xs={6}>
          <Query />
        </Grid>
      </Grid>
      <Box sx={{ mt: 1 }}>
        <Result />
      </Box>

      {/* Only show the graph if the expression isn't executed i.e. results are not loaded */}
      {!global.loaded && (
        <Box
          className={global.mode === 'graph' ? 'focussed' : 'unfocussed'}
          sx={{
            borderRadius: 1,
            // Unable to use flex to maximuze the height of the graph
            // Falling back on hardcoded height
            height: 'calc(100vh - 330px)',
            overflow: 'hidden',
          }}
        >
          {global.expression ? <GraphBox /> : Documentation}
        </Box>
      )}
    </Box>
  );
});

export default Session;
