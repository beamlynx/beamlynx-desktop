import { useState } from 'react';
import { Box, Link, Typography } from '@mui/material';
import ModalSurface from './ModalSurface';
import useAccountStatus from '../hooks/useAccountStatus';
import { PRIVACY_URL, SignInButtons, TERMS_URL } from './settings/AccountSection';

/**
 * Shown on desktop at every launch with a network connection, until the
 * person signs in: sign in with GitHub, or skip until the next launch.
 * Settings -> Account can sign in at any time.
 *
 * Kept to the sign-in itself, and one line at the bottom saying that queries
 * and data are never collected, only usage counts, with links to the privacy policy and terms. The desktop
 * app holds stats until this choice is made. The details, and the switch for
 * the detailed stats, are in Settings -> Account and the privacy policy.
 *
 * Not shown offline (sign-in can't work), in a browser, in a desktop build
 * without the sign-in service, or by a desktop app older than sign-in.
 * See beamlynx-plans/plans/012-know-who-uses-beamlynx.md.
 */
// Skipped in this launch. Outside the component, so the screen stays away
// until the app starts again, even if it remounts.
let skippedThisLaunch = false;

const FirstRunScreen = () => {
  const status = useAccountStatus();
  const [skipping, setSkipping] = useState(false);
  const [skipped, setSkipped] = useState(skippedThisLaunch);
  const account = typeof window === 'undefined' ? undefined : window.beamlynxDesktop?.account;

  if (!account || !status || !status.available || status.user || skipped || !status.online)
    return null;

  const skip = async () => {
    if (skipping) return;
    setSkipping(true);
    try {
      if (status.signingIn) await account.cancelSignIn();
      await account.skip();
      skippedThisLaunch = true;
      setSkipped(true);
    } finally {
      setSkipping(false);
    }
  };

  return (
    // Only Skip closes it: a click outside or Escape does nothing.
    <ModalSurface
      open
      onClose={() => {}}
      aria-labelledby="first-run-title"
      surfaceSx={{ width: 380, maxWidth: '90vw', p: 3.5 }}
    >
      <Typography
        id="first-run-title"
        variant="h6"
        component="h2"
        sx={{ color: 'var(--text-color)', fontWeight: 500, textAlign: 'center', mb: 3 }}
      >
        Welcome to Beamlynx
      </Typography>

      <SignInButtons />

      <Box sx={{ textAlign: 'center', mt: 1.5 }}>
        <Link
          component="button"
          variant="caption"
          color="text.secondary"
          onClick={skip}
          disabled={skipping}
          underline="hover"
        >
          Skip for now
        </Link>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 3 }}>
        Beamlynx never collects your queries or data. Only usage counts.{' '}
        <Link href={PRIVACY_URL} target="_blank" rel="noreferrer" color="inherit" underline="hover">
          Privacy
        </Link>
        {' · '}
        <Link href={TERMS_URL} target="_blank" rel="noreferrer" color="inherit" underline="hover">
          Terms
        </Link>
      </Typography>
    </ModalSurface>
  );
};

export default FirstRunScreen;
