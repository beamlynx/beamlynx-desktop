import type { NextPage } from 'next'
import Container from '@mui/material/Container';
import PineQuery from './PineQuery';
import ActiveConnection from './ActiveConnection';
import PineInput from './PineInput';
import PineResult from './PineResult';
import { Box, Grid } from '@mui/material';
import PineMessage from './PineMessage';


const Home: NextPage = () => {
  return (
  <Container maxWidth="xl">
    <Grid container >
      {/* <Grid item xs={12} sx={{ mt: 1, ml: 1}}>
          <PineMessage />
      </Grid> */}
      <Grid item xs={4}>
        <Box sx={{ m: 1}}>
          <PineMessage />
        </Box>
        <Box sx={{ m: 1}}>
          <PineInput />
        </Box>
      </Grid>
      <Grid item xs={8}>
        <Box sx={{ m: 1}}>
          <ActiveConnection />
          <PineQuery />
        </Box>
      </Grid>
    </Grid>
    <Box sx={{ m: 1}}>
      <PineResult/>
    </Box>
  </Container>
  )
}

export default Home
