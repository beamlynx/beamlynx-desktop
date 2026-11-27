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
// are open side by side. It is a label, not a call to act, so it is a quiet
// outline. Amber (--notification-color) is kept for UpdateChip, which does
// ask the person to do something.
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
          border: '1px solid var(--border-color)',
          color: 'var(--icon-color)',
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
