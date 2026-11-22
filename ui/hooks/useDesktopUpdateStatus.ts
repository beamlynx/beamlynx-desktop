import { useEffect, useState } from 'react';
import { isDesktop } from '../store/util';
import type { DesktopUpdateStatus } from '../desktop';

// The desktop app's update status (beamlynx-desktop's
// src/main/update-decision.ts). The app sends it only when it changes, so it
// is kept here, outside any component: a component that mounts later, such
// as the header coming back after Zen mode, still gets the current one.
let current: DesktopUpdateStatus | null = null;
const listeners = new Set<(status: DesktopUpdateStatus) => void>();
let subscribed = false;

function subscribe(): void {
  if (subscribed || !isDesktop() || typeof window === 'undefined' || !window.beamlynxDesktop)
    return;
  subscribed = true;
  window.beamlynxDesktop.onUpdateStatus(status => {
    current = status;
    listeners.forEach(listener => listener(status));
  });
}

/** null until the desktop app sends one, and always null outside it. */
export function useDesktopUpdateStatus(): DesktopUpdateStatus | null {
  const [status, setStatus] = useState(current);
  useEffect(() => {
    subscribe();
    setStatus(current);
    listeners.add(setStatus);
    return () => {
      listeners.delete(setStatus);
    };
  }, []);
  return status;
}
