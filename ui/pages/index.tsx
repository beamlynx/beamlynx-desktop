import type { NextPage } from 'next'
import Container from '@mui/material/Container';
import PineQuery from './PineQuery';
import ActiveConnection from './ActiveConnection';
import PineInput from './PineInput';


const Home: NextPage = () => {
  const x = "test";
  const y = 10;
  
  return (
  <Container maxWidth="xl">
    <PineInput></PineInput>
    <ActiveConnection></ActiveConnection>
    <PineQuery></PineQuery>
  </Container>
  )
}

export default Home
