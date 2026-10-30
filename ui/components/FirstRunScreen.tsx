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
 * It also says what usage stats the app sends, before any are sent (the
 * desktop app holds them until this choice is made). Launches and who is
 * signed in are always sent. The switch for the detailed stats is in
 * Settings -> Account, not here: the screen tells people about them without
 * inviting them to turn them off.
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
        sx={{ color: 'var(--text-color)', fontWeight: 500, textAlign: 'center', mb: 1 }}
      >
        Welcome to Beamlynx
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 3 }}>
        Sign in so we know who uses Beamlynx. It changes nothing in the app.
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

      <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid var(--border-color)' }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          Beamlynx counts each launch, with the app version and who is signed in. It also counts
          how often queries run, which you can turn off in Settings → Account. Never your queries,
          connections or data.
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          <Link href={PRIVACY_URL} target="_blank" rel="noreferrer">
            Privacy policy
          </Link>
          {' · '}
          <Link href={TERMS_URL} target="_blank" rel="noreferrer">
            Terms
          </Link>
        </Typography>
      </Box>
    </ModalSurface>
  );
};

export default FirstRunScreen;
