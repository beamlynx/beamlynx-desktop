import { useEffect, useState } from 'react';
import type { AccountStatus } from '../desktop';

/**
 * The desktop app's sign-in and usage stats state (beamlynx-desktop's
 * src/main/account.ts), kept current. Null until it has loaded, and always
 * null in a browser or a desktop app older than sign-in, so callers render
 * nothing then.
 *
 * Read after mount, never during the static export's server render, where
 * there is no window.
 */
export const useAccountStatus = (): AccountStatus | null => {
  const [status, setStatus] = useState<AccountStatus | null>(null);

  useEffect(() => {
    const account = typeof window === 'undefined' ? undefined : window.beamlynxDesktop?.account;
    if (!account) return;
    let live = true;
    account
      .status()
      .then(s => live && setStatus(s))
      .catch(() => {});
    const unsubscribe = account.onChanged(s => live && setStatus(s));
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  return status;
};

export default useAccountStatus;
