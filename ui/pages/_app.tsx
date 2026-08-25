import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useStores } from '../store/store-container';
import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { createAppTheme } from '../styles/theme';
import { TEXT_SIZE_SCALE } from '../styles/text-size';
import { UI_FONT_FAMILIES, CODE_FONT_FAMILIES } from '../styles/app-font';

const MyApp = observer(({ Component, pageProps }: AppProps) => {
  const { global } = useStores();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Server-rendered HTML (and the desktop build's static export) has no
  // access to localStorage, so it always builds with the 'dark' default -
  // keeping that until mounted isn't just for visual consistency: MUI/
  // Emotion dedupes the CssBaseline style tag it re-inserts on the client's
  // first render against what SSR already emitted, so if that first client
  // render used the real (non-default) theme instead, the mismatched CSS
  // silently never gets applied at all - the page stays on the SSR'd
  // default forever, even though every React/MobX value downstream
  // correctly says otherwise (this is exactly the "picking a theme has no
  // effect" bug reported after the surface/accent version of this shipped
  // without the same guard). A real update on a later render (post-mount)
  // doesn't hit that dedupe path, which is why clicking a swatch after
  // load always worked correctly.
  const themeToRender = useMemo(
    () => createAppTheme(mounted ? global.themeId : 'dark', TEXT_SIZE_SCALE[mounted ? global.textSize : 'medium']),
    [mounted, global.themeId, global.textSize],
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', global.theme);
  }, [global.theme]);

  useEffect(() => {
    const scale = TEXT_SIZE_SCALE[global.textSize];
    // createAppTheme (above) handles MUI's own typography/spacing, which
    // covers default Typography variants and anything using theme.spacing()
    // - but plenty of components in this codebase set a literal fontSize in
    // sx (px or rem), bypassing the theme entirely. --text-scale (used via
    // calc(<px> * var(--text-scale, 1)) at those specific call sites) covers
    // the ones that matter enough to opt in explicitly. Scaling the root
    // font-size on top of that is what makes a *plain* 'Nrem' literal (most
    // of the rest - e.g. the Settings rail, that never opted into the calc()
    // pattern) respond too, since rem is relative to this, not to MUI's
    // internal typography.fontSize base. Plain 'Npx' literals still won't
    // move without their own calc() - see TEXT_SIZE_SCALE's own comment.
    document.documentElement.style.setProperty('--text-scale', String(scale));
    document.documentElement.style.fontSize = `${scale * 100}%`;
  }, [global.textSize]);

  useEffect(() => {
    document.documentElement.style.setProperty('--canvas-font', UI_FONT_FAMILIES[global.uiFontFamily].fontFamily);
  }, [global.uiFontFamily]);

  useEffect(() => {
    document.documentElement.style.setProperty('--code-font', CODE_FONT_FAMILIES[global.codeFontFamily].fontFamily);
  }, [global.codeFontFamily]);

  return (
    <ThemeProvider theme={themeToRender}>
      <CssBaseline />
      <Component {...pageProps} />
    </ThemeProvider>
  );
});

export default MyApp;
