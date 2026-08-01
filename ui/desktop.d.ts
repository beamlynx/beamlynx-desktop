// Matches beamlynx-desktop's src/preload/index.ts contextBridge API.
// Only present when running inside the real Electron shell -- guard with
// `typeof window !== 'undefined' && window.beamlynxDesktop` before use, since
// isDesktop() (store/util.ts) can be true in a plain browser dev-server run
// (NEXT_PUBLIC_DESKTOP=1 without Electron) where this doesn't exist.
type DesktopUpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

interface BeamlynxDesktopApi {
  onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => () => void;
  restartToUpdate: () => void;
}

declare global {
  interface Window {
    beamlynxDesktop?: BeamlynxDesktopApi;
  }
}

export type { DesktopUpdateStatus };
