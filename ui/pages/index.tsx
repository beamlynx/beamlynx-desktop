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
  const [mounted, setMounted] = useState(false);

  // Load Connection details
  useEffect(() => {
    setMounted(true);
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

  // Prevent hydration mismatch by ensuring consistent rendering
  if (!mounted) {
    return AppContent;
  }

  return isDevelopment() || isPlayground() ? (
    AppContent
  ) : (
    <ClerkProvider>{AppContent}</ClerkProvider>
  );
};

export default Home;
