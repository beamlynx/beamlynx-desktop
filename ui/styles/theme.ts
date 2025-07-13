import { createTheme } from '@mui/material/styles';
import { lightColors, darkColors } from './colors';

const generateCssVariables = (colors: Record<string, string>) => {
  return Object.entries(colors)
    .map(([key, value]) => `${key}: ${value};`)
    .join('');
};

const lightVars = generateCssVariables(lightColors);
const darkVars = generateCssVariables(darkColors);

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: lightColors['--primary-color'],
    },
    background: {
      default: lightColors['--background-color'],
      paper: lightColors['--node-column-bg'],
    },
    text: {
      primary: lightColors['--text-color'],
      secondary: lightColors['--node-secondary-text-color'],
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: `:root{${lightVars}}`,
    },
  },
});

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: darkColors['--primary-color'],
    },
    background: {
      default: darkColors['--background-color'],
      paper: darkColors['--node-column-bg'],
    },
    text: {
      primary: darkColors['--text-color'],
      secondary: darkColors['--node-secondary-text-color'],
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: `[data-theme='dark']{${darkVars}}`,
    },
  },
});

export default theme;