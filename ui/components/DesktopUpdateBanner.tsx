import { useEffect, useState } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { isDesktop } from '../store/util';
import type { DesktopUpdateStatus } from '../desktop';

/**
 * Surfaces Electron's auto-update lifecycle in-app (see beamlynx-desktop's
 * src/main/auto-update.ts) instead of leaving it silent/console-only.
 * window.beamlynxDesktop only exists inside the real Electron shell (not a
 * plain browser dev-server run with NEXT_PUBLIC_DESKTOP=1), so this quietly
 * renders nothing there too.
 */
const DesktopUpdateBanner = () => {
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isDesktop() || typeof window === 'undefined' || !window.beamlynxDesktop) return;
    return window.beamlynxDesktop.onUpdateStatus(setStatus);
  }, []);

  if (!status || dismissed) return null;

  if (status.state === 'downloading') {
    return (
      <Snackbar open anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity="info" variant="filled">
          Downloading update... {status.percent}%
        </Alert>
      </Snackbar>
    );
  }

  if (status.state === 'downloaded') {
    return (
      <Snackbar open anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setDismissed(true)}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => window.beamlynxDesktop?.restartToUpdate()}
            >
              Restart Now
            </Button>
          }
        >
          Update ready ({status.version}) -- restart to install
        </Alert>
      </Snackbar>
    );
  }

  // checking / available / not-available / error: no UI. "available" is
  // immediately followed by a download starting, and errors are already
  // logged in the main process (see auto-update.ts) -- a background update
  // check failing isn't something a user needs to be alarmed by.
  return null;
};

export default DesktopUpdateBanner;
