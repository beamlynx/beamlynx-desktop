// Matches beamlynx-desktop's src/preload/index.ts contextBridge API.
// Only present when running inside the real Electron shell -- guard with
// `typeof window !== 'undefined' && window.beamlynxDesktop` before use, since
// isDesktop() (store/util.ts) can be true in a plain browser dev-server run
// (NEXT_PUBLIC_DESKTOP=1 without Electron) where this doesn't exist.
import type { AccessPolicy, AccessPolicyRule } from './store/client';

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
  // MCP always uses this connection's own assigned policy whenever this is
  // true -- there's no "on but unprotected" state (credential-store.ts's
  // setMcpEnabled refuses turning this on unless policyId already resolves
  // to a policy with an active rule).
  mcpEnabled: boolean;
  // Which access policy (window.beamlynxDesktop.accessPolicy) applies to
  // this connection, or null for none. See client.ts's
  // effectiveAccessPolicyRules.
  policyId: string | null;
  // Whether the connection owner has switched the assigned policy OFF for
  // their own (non-MCP) queries on this connection -- MCP is unconditional
  // and never reads this. Defaults to false (protected by default);
  // undefined (older saved connections) means false.
  bypassPolicyForOwnQueries?: boolean;
};

// `null` (SavedConnectionMeta's other failure shape) already means
// "connection id not found" -- refusing to enable MCP without an active
// policy is a second, distinct failure mode, so this can't reuse that.
type SetMcpEnabledResult =
  | { ok: true; profile: SavedConnectionMeta }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'no-active-policy' };

// Same shape of problem as SetMcpEnabledResult, from the other direction:
// refuses clearing/blanking policyId (to null, or to a policy with no
// active rule) while mcpEnabled is already true on that connection -- MCP
// must never end up pointing at nothing.
type SetConnectionPolicyResult =
  | { ok: true; profile: SavedConnectionMeta }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'mcp-requires-policy' };

// Sent by the main process (control-plane-server.ts) when an MCP client calls
// the run_query or complete_query MCP tool -- the renderer is the only place
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
  // Optional; falls back to a derived `user@host:port/db` label when blank
  // or omitted.
  label?: string;
};

type SaveConnectionResult = { persisted: true; profile: SavedConnectionMeta } | { persisted: false };

type GetConnectionResult =
  | { ok: true; profile: SavedConnectionMeta; dbPassword: string }
  | { ok: false; error: 'not-found' }
  | { ok: false; error: 'decryption-failed'; profile: SavedConnectionMeta };

interface BeamlynxDesktopApi {
  onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => () => void;
  restartToUpdate: () => void;
  // Backs the Settings About section's "App version" row -- reads the
  // installed desktop app's own version, same value `beamlynx --app-version`
  // prints from the CLI. Distinct from beamlynx-ui's own version (this
  // build's package.json) and from the connected server's version
  // (GlobalStore.version) -- three separate things that happen to often
  // move together but aren't the same number.
  getAppVersion: () => Promise<string>;
  credentials: {
    status: () => Promise<CredentialsStatus>;
    list: () => Promise<SavedConnectionMeta[]>;
    save: (input: SaveConnectionInput) => Promise<SaveConnectionResult>;
    get: (id: string) => Promise<GetConnectionResult>;
    delete: (id: string) => Promise<void>;
    setMcpEnabled: (id: string, enabled: boolean) => Promise<SetMcpEnabledResult>;
    setConnectionPolicy: (id: string, policyId: string | null) => Promise<SetConnectionPolicyResult>;
    setBypassPolicyForOwnQueries: (id: string, bypass: boolean) => Promise<SavedConnectionMeta | null>;
    rename: (id: string, label: string) => Promise<SavedConnectionMeta | null>;
  };
  // Named, user-creatable access policies -- each connection independently
  // selects which one applies (credentials.setConnectionPolicy above), or
  // none. See credential-store.ts and store/client.ts's
  // effectiveAccessPolicyRules.
  accessPolicy: {
    list: () => Promise<AccessPolicy[]>;
    create: (name: string) => Promise<AccessPolicy>;
    rename: (id: string, name: string) => Promise<AccessPolicy | null>;
    delete: (id: string) => Promise<void>;
    setModuleEnabled: (policyId: string, type: AccessPolicyRule['type'], enabled: boolean) => Promise<AccessPolicy | null>;
  };
  // Registers the renderer's handler for MCP-driven query execution -- the
  // handler must resolve with the eventual result (or throw), the preload
  // layer reports it back to main correlated by requestId. Returns an
  // unsubscribe function (same pattern as onUpdateStatus/onDeepLink below):
  // McpBridge.tsx's effect can re-run more than once in dev (Fast Refresh,
  // React Strict Mode), and without unsubscribing first, each re-run used
  // to pile up another live listener instead of replacing it -- see
  // preload/index.ts's onQueryRequest for what that caused in practice.
  mcp: {
    // The resolved command/args to register this install as an MCP server
    // (e.g. `claude mcp add beamlynx -- <command> <args>`). Resolved at call
    // time, not baked in statically -- the executable path varies by install
    // location and packaging format (.app bundle vs. deb-installed binary).
    getSetupInfo: () => Promise<{ command: string; args: string[] }>;
    onQueryRequest: (handler: (request: McpQueryRequest) => Promise<unknown>) => () => void;
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
  SetMcpEnabledResult,
  SetConnectionPolicyResult,
  CredentialsStatus,
  SaveConnectionInput,
  SaveConnectionResult,
  GetConnectionResult,
  McpQueryRequest,
  McpQueryResult,
};
