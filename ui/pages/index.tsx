import Container from '@mui/material/Container';
import type { NextPage } from 'next';
import { useEffect } from 'react';
import { reaction, runInAction } from 'mobx';
import AppView from '../components/AppView';
import DesktopUpdateBanner from '../components/DesktopUpdateBanner';
import ConnectionErrorSnackbar from '../components/ConnectionErrorSnackbar';
import McpBridge from '../components/McpBridge';
import DeepLinkHandler from '../components/DeepLinkHandler';
import RevealRequestHandler from '../components/RevealRequestHandler';
import { useStores } from '../store/store-container';
import { isDesktop } from '../store/util';

const Home: NextPage = () => {
  const { global } = useStores();

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
    runInAction(() => {
      global.connecting = true;
    });
    global.loadConnectionMetadata().finally(() => {
      runInAction(() => {
        global.connecting = false;
      });
    });
    if (isDesktop()) {
      global.loadCredentialsStatus();
    }

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
      <DesktopUpdateBanner />
      <ConnectionErrorSnackbar />
      <McpBridge />
      <DeepLinkHandler />
      <RevealRequestHandler />
    </Container>
  );

  return AppContent;
};

export default Home;
