import { createTheme, Theme } from '@mui/material/styles';
import { buildColorTokens } from './palette/build';
import { ColorTokens, THEME_MODE, ThemeId } from './palette/tokens';

const generateCssVariables = (colors: ColorTokens) => {
  return Object.entries(colors)
    .map(([key, value]) => `${key}: ${value};`)
    .join('');
};

// MUI's own default base (theme.typography.fontSize) is 14 - every default
// Typography variant (h1..h6, body1/2, button, caption...) is generated as
// a rem multiple of it, and MUI's internal components (buttons, chips,
// tabs...) inherit from those variants. Scaling this one number, plus
// theme.spacing's base unit (default 8px/factor), is what makes "Text
// size" reach broadly across the app's own chrome through ordinary React
// rendering - not CSS zoom, so it never touches the pixel dimensions of
// resizable panels/the canvas (see styles/text-size.ts for why that
// distinction is the whole point).
const MUI_BASE_FONT_SIZE = 14;
const MUI_BASE_SPACING = 8;

// MUI's default 16 -- the base its typography variants' generated `rem`
// values (h6, body1, caption, ...) are computed against internally
// (`pxToRem`). Left at the default for the main app theme, where the root
// <html> font-size is deliberately scaled in lockstep by the same
// textScale (see pages/_app.tsx and styles/text-size.ts's point 2) -- the
// two are meant to move together there. `createSettingsTheme` below passes
// a different value on purpose, to cancel that root scaling back out
// instead.
const MUI_DEFAULT_HTML_FONT_SIZE = 16;

export const createAppTheme = (themeId: ThemeId, textScale: number, htmlFontSize = MUI_DEFAULT_HTML_FONT_SIZE): Theme => {
  const colors = buildColorTokens(themeId);
  const vars = generateCssVariables(colors);
  const mode = THEME_MODE[themeId];

  return createTheme({
    palette: {
      mode,
      primary: {
        main: colors['--primary-color'],
      },
      background: {
        default: colors['--background-color'],
        paper: colors['--node-column-bg'],
      },
      text: {
        primary: colors['--text-color'],
        secondary: colors['--node-secondary-text-color'],
      },
    },
    typography: {
      fontSize: MUI_BASE_FONT_SIZE * textScale,
      htmlFontSize,
    },
    spacing: (factor: number) => `${MUI_BASE_SPACING * textScale * factor}px`,
    components: {
      MuiCssBaseline: {
        styleOverrides: `:root{${vars}}`,
      },
    },
  });
};

/**
 * A theme for UI that must hold still while Text Size changes, even though
 * it lives in the same React tree as everything that setting scales (e.g.
 * SettingsModal.tsx, so its own Text Size control doesn't visibly reflow
 * out from under you while you use it -- reported live as "it scrolls away
 * and I have to scroll back"). Fixing typography.fontSize/spacing (what
 * `createAppTheme(themeId, 1)` alone gives you) only cancels out the part
 * of the scaling that flows through the theme object. It does NOT cancel
 * the OTHER, independent mechanism: MUI's own Typography variants render
 * as `rem`, which always resolves against the document root's font-size,
 * and pages/_app.tsx also scales that root font-size directly (styles/
 * text-size.ts's point 2) -- a mechanism no theme object can override,
 * since rem ignores intermediate ancestors entirely. Compensating
 * `htmlFontSize` by the same live scale the root is currently set to
 * exactly cancels that out: MUI computes each rem value as size /
 * htmlFontSize, so scaling htmlFontSize by the same factor as the root's
 * font-size leaves the final rendered pixel size unchanged regardless of
 * what Text Size is currently set to.
 */
export const createSettingsTheme = (themeId: ThemeId, currentTextScale: number): Theme =>
  createAppTheme(themeId, 1, MUI_DEFAULT_HTML_FONT_SIZE * currentTextScale);
