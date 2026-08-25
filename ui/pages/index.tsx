import { ClerkProvider } from '@clerk/nextjs';
import Container from '@mui/material/Container';
import type { NextPage } from 'next';
import { useEffect, useState } from 'react';
import { reaction, runInAction } from 'mobx';
import AppView from '../components/AppView';
import DesktopUpdateBanner from '../components/DesktopUpdateBanner';
import ConnectionErrorSnackbar from '../components/ConnectionErrorSnackbar';
import McpBridge from '../components/McpBridge';
import DeepLinkHandler from '../components/DeepLinkHandler';
import { useStores } from '../store/store-container';
import { isDesktop, isDevelopment, isPlayground } from '../store/util';
import { appFontVariablesClassName } from '../styles/app-font';

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
    // appFontVariablesClassName defines all four --font-* CSS custom
    // properties (see styles/app-font.ts) on this element and everything
    // below it - applied once, here, at the app's actual root, so every
    // surface (results grid, editors, tabs, modals, canvas mode) has them
    // available regardless of which subtree it lives in. Which one
    // --canvas-font actually points to is set separately, imperatively, in
    // pages/_app.tsx based on GlobalStore.fontFamily.
    <Container
      maxWidth={false}
      disableGutters={true}
      className={appFontVariablesClassName}
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
    </Container>
  );

  // Prevent hydration mismatch by ensuring consistent rendering
  if (!mounted) {
    return AppContent;
  }

  return isDevelopment() || isPlayground() || isDesktop() ? (
    AppContent
  ) : (
    <ClerkProvider>{AppContent}</ClerkProvider>
  );
};

export default Home;
