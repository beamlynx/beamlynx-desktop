import { useState } from 'react';
import { Box, Button, CircularProgress, Link, Typography } from '@mui/material';
import { GitHub, Google } from '@mui/icons-material';
import useAccountStatus from '../../hooks/useAccountStatus';
import ToggleRow from './ToggleRow';
import type { SignInResult } from '../../desktop';

export const PRIVACY_URL = 'https://beamlynx.com/privacy';
export const TERMS_URL = 'https://beamlynx.com/terms';

const PROVIDER_NAMES: Record<string, string> = { github: 'GitHub', google: 'Google' };

// Google's consent screen names the Supabase project's domain, not Beamlynx,
// until Google verifies the brand. Hidden until then; Google sign-in stays set
// up in Supabase, so turning this back on is all it takes.
const SHOW_GOOGLE = false;

/**
 * The sign-in buttons, a waiting state with Cancel, and a one-line error.
 * Shared by the first-run screen and Settings -> Account.
 */
export const SignInButtons = ({ onSignedIn }: { onSignedIn?: () => void }) => {
  const status = useAccountStatus();
  const [error, setError] = useState<string | null>(null);
  const account = typeof window === 'undefined' ? undefined : window.beamlynxDesktop?.account;
  if (!account || !status) return null;

  const signIn = async (provider: 'github' | 'google') => {
    setError(null);
    const result: SignInResult = await account.signIn(provider);
    if (result.ok) onSignedIn?.();
    else if (result.reason === 'failed') {
      setError(
        status.online
          ? `Couldn't sign in: ${result.message}`
          : "Couldn't sign in. Beamlynx needs an internet connection for this.",
      );
    }
  };

  if (status.signingIn) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" sx={{ color: 'var(--text-color)', flex: 1 }}>
          Continue in your browser…
        </Typography>
        <Button size="small" onClick={() => account.cancelSignIn()}>
          Cancel
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Button
        variant="contained"
        startIcon={<GitHub />}
        onClick={() => signIn('github')}
        sx={{ textTransform: 'none' }}
      >
        Sign in with GitHub
      </Button>
      {SHOW_GOOGLE && (
        <Button
          variant="outlined"
          startIcon={<Google />}
          onClick={() => signIn('google')}
          sx={{ textTransform: 'none' }}
        >
          Sign in with Google
        </Button>
      )}
      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}
    </Box>
  );
};

/**
 * Who is signed in, or the sign-in buttons, and the detailed usage stats
 * switch. Launches and who is signed in are sent either way.
 * Desktop only (the section is in DESKTOP_ONLY_SECTIONS). Signing in only
 * tells us who uses Beamlynx; the app works the same either way.
 */
const AccountSection = () => {
  const status = useAccountStatus();
  const account = typeof window === 'undefined' ? undefined : window.beamlynxDesktop?.account;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Typography
        variant="h6"
        component="h2"
        sx={{
          flexShrink: 0,
          color: 'var(--text-color)',
          pb: 1.5,
          mb: 2,
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        Account
      </Typography>

      <Box
        className="styled-scrollbar"
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', maxWidth: 420 }}
      >
        {!status || !account ? (
          <Typography variant="body2" color="text.secondary">
            Sign-in needs a newer Beamlynx desktop app.
          </Typography>
        ) : !status.available ? (
          <Typography variant="body2" color="text.secondary">
            Sign-in isn&apos;t available in this build.
          </Typography>
        ) : status.user ? (
          <>
            <Typography variant="body2" sx={{ color: 'var(--text-color)', mb: 0.5 }}>
              Signed in as <strong>{status.user.email ?? status.user.name ?? 'you'}</strong>
              {status.user.provider && PROVIDER_NAMES[status.user.provider]
                ? ` with ${PROVIDER_NAMES[status.user.provider]}`
                : ''}
              .
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              This tells us who uses Beamlynx. Your queries, connections and data never leave this
              computer.
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => account.signOut()}
              sx={{ textTransform: 'none' }}
            >
              Sign out
            </Button>
          </>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Sign in so we know who uses Beamlynx. It changes nothing in the app. Your queries,
              connections and data never leave this computer.
            </Typography>
            <SignInButtons />
          </>
        )}
        {status?.available && account && (
          <Box sx={{ mt: 3, borderTop: '1px solid var(--border-color)' }}>
            <ToggleRow
              label="Send detailed usage stats"
              description="Counts of how often queries run, and which database types you add. Each launch, the app version and who is signed in are always sent. Never your queries, connections or data."
              checked={status.usageStats}
              onChange={checked => account.setUsageStats(checked)}
            />
          </Box>
        )}
        <Typography variant="caption" sx={{ display: 'block', mt: 3 }}>
          <Link href={PRIVACY_URL} target="_blank" rel="noreferrer">
            Privacy policy
          </Link>
          {' · '}
          <Link href={TERMS_URL} target="_blank" rel="noreferrer">
            Terms
          </Link>
        </Typography>
      </Box>
    </Box>
  );
};

export default AccountSection;
