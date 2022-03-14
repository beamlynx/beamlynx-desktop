import type { NextPage } from 'next'
import Container from '@mui/material/Container';
import PineQuery from './PineQuery';
import ActiveConnection from './ActiveConnection';
import PineInput from './PineInput';
import PineResult from './PineResult';
import { Box, Grid } from '@mui/material';
import PineError from './PineError';


const Home: NextPage = () => {
  const x = "test";
  const y = 10;
  
  return (
  <Container maxWidth="xl">
    <Grid container spacing={10}>
      <Grid item xs={4}>
        <Box sx={{ my: 2}}>
          <PineInput />
        </Box>
      </Grid>
      <Grid item xs={8}>
        <Box sx={{ my: 2}}>
          <ActiveConnection />
          <PineQuery />
          <PineError />
        </Box>
      </Grid>
    </Grid>
    <PineResult />
  </Container>
  )
}

export default Home
