import type { NextPage } from 'next'
import Container from '@mui/material/Container';
import Query from './components/Query';
import ActiveConnection from './components/ActiveConnection';
import Input from './components/Input';
import Result from './components/Result';
import { Box, Grid } from '@mui/material';
import Message from './components/Message';


const Home: NextPage = () => {
  return (
  <Container maxWidth={false} disableGutters={true}>
    <Grid container>
      <Grid item xs={2}>
        <Box sx={{ m: 2, mt: 1 }}>
          <ActiveConnection />
        </Box>
      </Grid>

      <Grid item xs={10}>
        <Box sx={{ m: 1}}>
          <Message />
        </Box> 
      </Grid>

    </Grid>

    <Box sx={{ ml: 1, mr: 1}}>
      <Input />
    </Box>


    <Box sx={{ ml: 2}}>
      <Query />
    </Box>

    <Box>
      <Result/>
    </Box>
  </Container>
  )
}

export default Home
