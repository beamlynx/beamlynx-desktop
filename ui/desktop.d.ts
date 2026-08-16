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
  mcpEnabled: boolean;
};

// Sent by the main process (control-plane-server.ts) when an MCP client calls
// the run_query or explain_query MCP tool -- the renderer is the only place
// that can actually execute a query into a visible tab. See
// beamlynx-plans/pending/2026-08-15-mcp-server-and-url-scheme.md.
type McpQueryRequest = {
  requestId: string;
  kind: 'eval' | 'build';
  profileId: string;
  expression: string;
};

type McpQueryResult =
  | { requestId: string; ok: true; result: unknown }
  | { requestId: string; ok: false; error: string };

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
    setMcpEnabled: (id: string, enabled: boolean) => Promise<SavedConnectionMeta | null>;
  };
  // Registers the renderer's single handler for MCP-driven query execution.
  // Call once, at app startup (see components/McpBridge.tsx) -- the handler
  // must resolve with the eventual result (or throw), the preload layer
  // reports it back to main correlated by requestId.
  mcp: {
    // The resolved command/args to register this install as an MCP server
    // (e.g. `claude mcp add beamlynx -- <command> <args>`). Resolved at call
    // time, not baked in statically -- the executable path varies by install
    // location and packaging format (.app bundle vs. deb-installed binary).
    getSetupInfo: () => Promise<{ command: string; args: string[] }>;
    onQueryRequest: (handler: (request: McpQueryRequest) => Promise<unknown>) => void;
  };
  // Fired when the user clicks a beamlynx:// deep link and this window is
  // the one that ends up handling it (see main/index.ts's handleDeepLink).
  onDeepLink: (callback: (params: { connection?: string; expression?: string }) => void) => () => void;
  // Call once, on mount -- flushes any deep link that arrived before this
  // window's renderer was ready to receive it.
  notifyRendererReady: () => void;
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
  McpQueryRequest,
  McpQueryResult,
};
