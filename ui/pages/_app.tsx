import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useStores } from '../store/store-container';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme, { darkTheme } from '../styles/theme';

const MyApp = observer(({ Component, pageProps }: AppProps) => {
  const { global } = useStores();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Use the server-rendered theme (light) until mounted on the client
  const themeToRender = mounted && global.theme === 'dark' ? darkTheme : theme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', global.theme);
  }, [global.theme]);

  return (
    <ThemeProvider theme={themeToRender}>
      <CssBaseline />
      <Component {...pageProps} />
    </ThemeProvider>
  );
});

export default MyApp;
