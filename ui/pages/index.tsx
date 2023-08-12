import { Box, Grid } from '@mui/material';
import Container from '@mui/material/Container';
import type { NextPage } from 'next';
import ActiveConnection from './components/ActiveConnection';
import Input from './components/Input';
import Graph from './components/Graph';
import Message from './components/Message';
import Query from './components/Query';
import Result from './components/Result';
import Settings from './components/Settings';

const Home: NextPage = () => {
  return (
    <Container maxWidth={false} disableGutters={true}>
      <Grid container>
        <Grid item xs={2}>
          <Box sx={{ m: 2, mt: 1 }}>
            <ActiveConnection />
          </Box>
        </Grid>

        <Grid item xs={8}>
          <Box sx={{ m: 1 }}>
            <Message />
          </Box>
        </Grid>

        <Grid item xs={2}>
          <Settings />
        </Grid>
      </Grid>

      <Box sx={{ ml: 1, mr: 1 }}>
        <Input />
      </Box>

      <Grid container>
        <Grid item xs={8}>
          <Graph />
        </Grid>
        <Grid item xs={4}>
          <Box sx={{ m: 2 }}>
            <Query />
          </Box>
        </Grid>
      </Grid>

      <Box>
        <Result />
      </Box>
    </Container>
  );
};

export default Home;
