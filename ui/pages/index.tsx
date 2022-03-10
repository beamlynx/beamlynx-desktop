import type { NextPage } from 'next'
import Container from '@mui/material/Container';
import PineExpression from './PineExpression';
import Connection from './Connection';

const Home: NextPage = () => {
  return (
  <Container maxWidth="xl">
    <Connection></Connection>
    <PineExpression></PineExpression>
  </Container>

  )
}

export default Home
