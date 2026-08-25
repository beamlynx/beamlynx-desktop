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

export const createAppTheme = (themeId: ThemeId, textScale: number): Theme => {
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
    },
    spacing: (factor: number) => `${MUI_BASE_SPACING * textScale * factor}px`,
    components: {
      MuiCssBaseline: {
        styleOverrides: `:root{${vars}}`,
      },
    },
  });
};
