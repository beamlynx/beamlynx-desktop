import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { useDesktopUpdateStatus } from '../hooks/useDesktopUpdateStatus';
import ModalSurface from './ModalSurface';

/**
 * Shown instead of the app when this version is older than the oldest one
 * allowed (beamlynx-desktop's src/main/update-decision.ts decides). It has no
 * close button, and Escape does nothing: the only way on is to update.
 * Updates the person may put off show as UpdateChip in the header instead.
 * Outside the real Electron shell there is no status, so this renders
 * nothing.
 */
const RequiredUpdateScreen = () => {
  const status = useDesktopUpdateStatus();
  if (!status || status.state === 'none' || !status.required) return null;
  const desktop = typeof window !== 'undefined' ? window.beamlynxDesktop : undefined;
  return (
    <ModalSurface
      open
      onClose={() => {}}
      // Keeps the app's own shortcuts (Run, the command palette) from
      // working behind the screen.
      onKeyDown={e => e.stopPropagation()}
      surfaceSx={{ width: 460, p: 3 }}
      aria-labelledby="required-update-title"
    >
      <Typography
        id="required-update-title"
        variant="h6"
        component="h2"
        sx={{ color: 'var(--text-color)', fontWeight: 500, mb: 1.5 }}
      >
        Update Beamlynx to keep using it
      </Typography>
      <Box sx={{ color: 'var(--text-color)', mb: 3, fontSize: 14, '& p': { m: 0, mb: 1 } }}>
        <p>This version is no longer supported.</p>
        {status.state === 'downloading' && (
          <>
            <p>
              Downloading {status.version}... {status.percent}%
            </p>
            <LinearProgress
              variant="determinate"
              value={status.percent}
              sx={{ mt: 1.5, '& .MuiLinearProgress-bar': { bgcolor: 'var(--primary-color)' } }}
            />
          </>
        )}
        {status.state === 'downloaded' && (
          <p>Version {status.version} is ready. Restart to finish updating.</p>
        )}
        {status.state === 'download-yourself' && (
          <p>
            This copy can&apos;t update itself. Download version {status.version} and install it over
            this one.
          </p>
        )}
      </Box>
      {status.state !== 'downloading' && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            autoFocus
            variant="contained"
            onClick={() =>
              status.state === 'downloaded'
                ? desktop?.restartToUpdate()
                : desktop?.openDownloadPage()
            }
            sx={{
              bgcolor: 'var(--primary-color)',
              color: '#fff',
              '&:hover': { bgcolor: 'var(--primary-color)', opacity: 0.9 },
            }}
          >
            {status.state === 'downloaded' ? 'Restart Now' : `Download ${status.version}`}
          </Button>
        </Box>
      )}
    </ModalSurface>
  );
};

export default RequiredUpdateScreen;
