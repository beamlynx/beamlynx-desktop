import { Box, Tooltip } from '@mui/material';
import { useDesktopUpdateStatus } from '../hooks/useDesktopUpdateStatus';

// The one place the header shows an update the person can put off. It
// appears only when there is something to do:
// - the update has downloaded: RESTART TO UPDATE restarts the app;
// - the app can't update itself: UPDATE TO X opens the download page.
// While an update downloads, nothing shows. A version below the minimum
// gets RequiredUpdateScreen instead. Same shape as DevModeChip, in the
// theme's primary color, and a button.
const UpdateChip = () => {
  const status = useDesktopUpdateStatus();
  if (!status || status.state === 'none' || status.state === 'downloading' || status.required) {
    return null;
  }
  const desktop = typeof window !== 'undefined' ? window.beamlynxDesktop : undefined;
  const chip =
    status.state === 'downloaded'
      ? {
          label: 'RESTART TO UPDATE',
          tooltip: `Beamlynx ${status.version} is ready. Restart to finish updating.`,
          onClick: () => desktop?.restartToUpdate(),
        }
      : {
          label: `UPDATE TO ${status.version}`,
          tooltip: `This copy can't update itself. Download Beamlynx ${status.version} and install it over this one.`,
          onClick: () => desktop?.openDownloadPage(),
        };
  return (
    <Tooltip title={chip.tooltip}>
      <Box
        component="button"
        type="button"
        onClick={chip.onClick}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          height: 22,
          px: 1,
          border: 'none',
          borderRadius: 999,
          backgroundColor: 'var(--primary-color)',
          color: '#fff',
          boxShadow: '0 0 0 3px color-mix(in srgb, var(--primary-color) 22%, transparent)',
          fontFamily: 'var(--code-font)',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          lineHeight: 1,
          userSelect: 'none',
          cursor: 'pointer',
          '&:hover': { opacity: 0.9 },
        }}
      >
        <Box
          component="span"
          sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'currentColor' }}
        />
        {chip.label}
      </Box>
    </Tooltip>
  );
};

export default UpdateChip;
