import { ClerkProvider } from '@clerk/nextjs';
import { Box, Grid, Typography } from '@mui/material';
import Container from '@mui/material/Container';
import type { NextPage } from 'next';
import ActiveConnection from '../components/ActiveConnection';
import GraphBox from '../components/Graph.box';
import Input from '../components/Input';
import Message from '../components/Message';
import Query from '../components/Query';
import Result from '../components/Result';
import UserBox from '../components/UserBox';

const Home: NextPage = () => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  const UserContent = isDevelopment ? (
    <Typography variant="caption" color="gray">
      Dev Mode
    </Typography>
  ) : (
    <UserBox />
  );

  const AppContent = (
    <Container
      maxWidth={false}
      disableGutters={true}
      sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}
    >
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
          {UserContent}
        </Grid>
      </Grid>

      <Grid container>
        <Grid item xs={9}>
          <Box sx={{ ml: 1, mr: 2 }}>
            <Input />
          </Box>
        </Grid>
        <Grid item xs={3}>
          <Box sx={{ m: 2 }} />
        </Grid>
      </Grid>

      <Box sx={{ m: 1 }}>
        <Result />
      </Box>

      <Grid container sx={{ flexGrow: 1 }}>
        <Grid item xs={9} sx={{ display: 'flex', flexDirection: 'column' }}>
          <GraphBox sx={{ flexGrow: 1 }} />
        </Grid>
        <Grid item xs={3}>
          <Box sx={{ ml: 1 }}>
            <Query />
          </Box>
        </Grid>
      </Grid>
    </Container>
  );

  return isDevelopment ? AppContent : <ClerkProvider>{AppContent}</ClerkProvider>;
};

export default Home;
