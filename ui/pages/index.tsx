import { ClerkProvider } from '@clerk/nextjs';
import Container from '@mui/material/Container';
import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import AppView from '../components/AppView';
import { useStores } from '../store/store-container';
import { isDevelopment } from '../store/util';

const Home: NextPage = () => {
  const { global } = useStores();

  // Load Connection details
  useEffect(() => {
    global.connecting = true;
    global
      .loadConnectionMetadata()
      .then(() => {
        global.connected = true;
        global.connecting = false;
      })
      .catch(err => {
        global.connected = false;
        global.connecting = false;
        console.error(err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const AppContent = (
    <Container
      maxWidth={false}
      disableGutters={true}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
      }}
    >
      <AppView />
    </Container>
  );

  return isDevelopment ? AppContent : <ClerkProvider>{AppContent}</ClerkProvider>;
};

export default Home;
