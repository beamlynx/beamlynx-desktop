import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useStores } from '../store/store-container';
import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';

const MyApp = observer(({ Component, pageProps }: AppProps) => {
  const { global } = useStores();
  const session = global.getSession(global.activeSessionId);

  useEffect(() => {
    if (session) {
      document.documentElement.setAttribute('data-theme', session.theme);
    }
  }, [session, session.theme]);

  return <Component {...pageProps} />
});

export default MyApp;
