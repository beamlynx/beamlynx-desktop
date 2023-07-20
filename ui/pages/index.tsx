import type { NextPage } from 'next'
import Container from '@mui/material/Container';
import Query from './components/Query';
import ActiveConnection from './components/ActiveConnection';
import Input from './components/Input';
import Result from './components/Result';
import { Box, Grid } from '@mui/material';
import Message from './components/Message';
import Suggestions from './components/Suggestions';


const Home: NextPage = () => {
  return (
  <Container maxWidth="xl">
    <Grid container >
      <Grid item xs={4}>
        <Box sx={{ m: 1}}>
          <Message />
        </Box>
        <Box sx={{ m: 1}}>
          <Input />
        </Box>
        <Box sx={{ m: 1}}>
          <Suggestions />
        </Box>
      </Grid>
      <Grid item xs={8}>
        <Box sx={{ m: 1}}>
          <ActiveConnection />
          <Query />
        </Box>
      </Grid>
    </Grid>
    <Box sx={{ m: 1}}>
      <Result/>
    </Box>
  </Container>
  )
}

export default Home
