import type { NextPage } from 'next'
import Container from '@mui/material/Container';
import PineExpressionTextField from './PineExpressionInput';

const Home: NextPage = () => {
  return (
  <Container maxWidth="xl">
    <PineExpressionTextField></PineExpressionTextField>
  </Container>

  )
}

export default Home
