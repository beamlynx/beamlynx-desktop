import { ClerkProvider } from '@clerk/nextjs';
import { Box, Grid } from '@mui/material';
import Container from '@mui/material/Container';
import type { NextPage } from 'next';
import ActiveConnection from './components/ActiveConnection';
import GraphBox from './components/Graph.box';
import Input from './components/Input';
import Message from './components/Message';
import Query from './components/Query';
import Result from './components/Result';
import UserBox from './components/UserBox';

const Home: NextPage = () => {
  return (
    <ClerkProvider>
      <Container maxWidth={false} disableGutters={true}>
        <Grid container>
          <Grid item xs={2}>
            <Box sx={{ m: 2, mt: 1 }}>
              <ActiveConnection />
            </Box>
          </Grid>

          <Grid item xs={9}>
            <Box sx={{ m: 1 }}>
              <Message />
            </Box>
          </Grid>

          <Grid item xs={1}>
            <UserBox />
          </Grid>
        </Grid>

        <Grid container>
          <Grid item xs={9}>
            <Box sx={{ ml: 1, mr: 2 }}>
              <Input />
            </Box>

          </Grid>
          <Grid item xs={3}>
            <Box sx={{ m: 2 }}>
            </Box>
          </Grid>
        </Grid>


        <Grid container>
          <Grid item xs={9}>
            <GraphBox />
          </Grid>
          <Grid item xs={3}>
            <Box sx={{ m: 2 }}>
              <Query />
            </Box>
          </Grid>
        </Grid>

        <Box>
          <Result />
        </Box>
      </Container>
    </ClerkProvider>
  );
};

export default Home;
