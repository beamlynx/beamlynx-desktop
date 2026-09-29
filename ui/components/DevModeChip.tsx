import { Box, Tooltip } from '@mui/material';
import { isDevelopment } from '../store/util';

// A desktop dev build (`npm start` in beamlynx-desktop) usually loads the
// static export, where NODE_ENV is 'production' and isDevelopment() is
// false. The desktop bridge says so directly instead.
const isDesktopDevBuild = () => typeof window !== 'undefined' && window.beamlynxDesktop?.isDevBuild === true;

const isDevMode = () => isDevelopment() || isDesktopDevBuild();

const describe = () =>
  isDesktopDevBuild()
    ? 'Desktop dev build: its own ports and data folder, separate from the installed app. Saved connections are shared.'
    : 'Running from next dev.';

// Header badge, so a dev copy can't be mistaken for the real one when both
// are open side by side. Amber (--notification-color) reads as "caution"
// without looking like an error.
const DevModeChip = () => {
  if (!isDevMode()) return null;
  return (
    <Tooltip title={describe()}>
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          height: 22,
          px: 1,
          borderRadius: 999,
          backgroundColor: 'var(--notification-color)',
          // Near-black in every theme: the light themes' background color on
          // their amber is only ~3.3:1, this is 4.8:1 or better.
          color: '#1a1b26',
          boxShadow: '0 0 0 3px color-mix(in srgb, var(--notification-color) 22%, transparent)',
          fontFamily: 'var(--code-font)',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          lineHeight: 1,
          userSelect: 'none',
          cursor: 'default',
        }}
      >
        <Box
          component="span"
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: 'currentColor',
          }}
        />
        DEV
      </Box>
    </Tooltip>
  );
};

export default DevModeChip;
