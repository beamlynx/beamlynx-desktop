import { useRef, useState } from 'react';
import { Box, Checkbox, FormControlLabel, Link, Typography } from '@mui/material';
import ModalSurface from './ModalSurface';
import useAccountStatus from '../hooks/useAccountStatus';
import { PRIVACY_URL, SignInButtons, TERMS_URL } from './settings/AccountSection';

/**
 * Shown once, on desktop, the first time Beamlynx starts with a network
 * connection: sign in with GitHub, or skip. Either choice is final:
 * it never comes back on its own, and Settings -> Account can sign in later.
 *
 * It also says that the app sends anonymous usage stats, before any are
 * sent (the desktop app holds them until this choice is made). The checkbox
 * applies the moment it changes, so unchecking it and then skipping sends
 * nothing at all.
 *
 * Not shown offline (sign-in can't work), in a browser, in a desktop build
 * without the sign-in service, or by a desktop app older than sign-in.
 * See beamlynx-plans/plans/012-know-who-uses-beamlynx.md.
 */
const FirstRunScreen = () => {
  const status = useAccountStatus();
  const [skipping, setSkipping] = useState(false);
  // The checkbox's last change, so Skip waits for it to land first.
  const pendingToggle = useRef<Promise<unknown>>(Promise.resolve());
  const account = typeof window === 'undefined' ? undefined : window.beamlynxDesktop?.account;

  if (!account || !status || !status.available || status.onboarding !== null || !status.online)
    return null;

  const skip = async () => {
    if (skipping) return;
    setSkipping(true);
    try {
      await pendingToggle.current;
      if (status.signingIn) await account.cancelSignIn();
      await account.skip();
    } finally {
      setSkipping(false);
    }
  };

  return (
    // Closing it any other way counts as Skip.
    <ModalSurface
      open
      onClose={skip}
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
        Sign in once so we know who uses Beamlynx. You won&apos;t be asked again.
      </Typography>

      <SignInButtons />

      <Box sx={{ textAlign: 'center', mt: 1.5 }}>
        <Link
          component="button"
          variant="body2"
          onClick={skip}
          disabled={skipping}
          underline="hover"
        >
          Skip for now
        </Link>
      </Box>

      <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid var(--border-color)' }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          Beamlynx sends anonymous usage stats, like how often queries run. Never your queries,
          connections or data.
        </Typography>
        <FormControlLabel
          sx={{
            mt: 0.5,
            '& .MuiFormControlLabel-label': { fontSize: '0.8rem', color: 'var(--text-color)' },
          }}
          control={
            <Checkbox
              size="small"
              checked={status.usageStats}
              onChange={(_e, checked) => {
                pendingToggle.current = account.setUsageStats(checked);
              }}
            />
          }
          label="Send usage stats"
        />
        <Typography variant="caption" sx={{ display: 'block' }}>
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
