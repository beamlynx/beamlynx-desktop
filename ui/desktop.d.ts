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

type SavedConnectionMeta = {
  id: string;
  label: string;
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  createdAt: string;
  lastUsedAt: string;
};

type CredentialsStatus = {
  persistenceAvailable: boolean;
  linuxBackend?: string;
};

type SaveConnectionInput = {
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
};

type SaveConnectionResult = { persisted: true; profile: SavedConnectionMeta } | { persisted: false };

type GetConnectionResult =
  | { ok: true; profile: SavedConnectionMeta; dbPassword: string }
  | { ok: false; error: 'not-found' }
  | { ok: false; error: 'decryption-failed'; profile: SavedConnectionMeta };

interface BeamlynxDesktopApi {
  onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => () => void;
  restartToUpdate: () => void;
  credentials: {
    status: () => Promise<CredentialsStatus>;
    list: () => Promise<SavedConnectionMeta[]>;
    save: (input: SaveConnectionInput) => Promise<SaveConnectionResult>;
    get: (id: string) => Promise<GetConnectionResult>;
    delete: (id: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    beamlynxDesktop?: BeamlynxDesktopApi;
  }
}

export type {
  DesktopUpdateStatus,
  SavedConnectionMeta,
  CredentialsStatus,
  SaveConnectionInput,
  SaveConnectionResult,
  GetConnectionResult,
};
