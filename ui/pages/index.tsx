import { ClerkProvider } from '@clerk/nextjs';
import Container from '@mui/material/Container';
import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { reaction } from 'mobx';
import AppView from '../components/AppView';
import { useStores } from '../store/store-container';
import { isDevelopment, isPlayground } from '../store/util';

const Home: NextPage = () => {
  const { global } = useStores();
  const [isPlaygroundEnv, setIsPlaygroundEnv] = useState(false);

  // Load Connection details
  useEffect(() => {
    let pollingInterval: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (pollingInterval) return;
      pollingInterval = setInterval(() => {
        global.loadConnectionMetadata();
      }, 3000); // Poll every 3 seconds
    };

    const stopPolling = () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    };

    // Initial load
    global.connecting = true;
    global.loadConnectionMetadata().finally(() => {
      global.connecting = false;
    });

    // Setup a reaction to manage polling based on connection status
    const disposer = reaction(
      () => global.pineConnected,
      connected => {
        if (connected) {
          stopPolling();
        } else {
          startPolling();
        }
      },
      { fireImmediately: true }, // Fire immediately to check initial state
    );

    // Check if we're in playground environment
    setIsPlaygroundEnv(isPlayground());

    // Cleanup on component unmount
    return () => {
      stopPolling();
      disposer();
    };
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

  return isDevelopment() || isPlaygroundEnv ? (
    AppContent
  ) : (
    <ClerkProvider>{AppContent}</ClerkProvider>
  );
};

export default Home;
