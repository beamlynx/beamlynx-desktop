// Intentionally minimal: the UI talks to the bundled server via plain
// fetch() against http://localhost:33333 (see beamlynx-ui/store/client.ts),
// same as it does against a Docker-run server today. The one thing the web
// UI genuinely can't do itself is know about Electron's auto-update
// lifecycle (see src/main/auto-update.ts) -- that's exposed here so
// beamlynx-ui can show it in-app instead of it being silent/console-only.
import { contextBridge, ipcRenderer } from 'electron';
import type { UpdateStatus } from '../main/auto-update';
import type {
  AccessPolicy,
  AccessPolicyRule,
  CredentialsStatus,
  GetConnectionResult,
  SaveConnectionInput,
  SaveConnectionResult,
  SavedConnectionMeta,
  SetConnectionPolicyResult,
  SetMcpEnabledResult,
} from '../main/credential-store';
// Matches beamlynx-ui's desktop.d.ts McpQueryRequest -- kept as a hand-mirrored
// type across the repo boundary, same convention as the credential types above.
type McpQueryRequest = {
  requestId: string;
  kind: 'eval' | 'build';
  profileId: string;
  expression: string;
};

contextBridge.exposeInMainWorld('beamlynxDesktop', {
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  restartToUpdate: () => ipcRenderer.send('restart-to-update'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  credentials: {
    status: (): Promise<CredentialsStatus> => ipcRenderer.invoke('credentials:status'),
    list: (): Promise<SavedConnectionMeta[]> => ipcRenderer.invoke('credentials:list'),
    save: (input: SaveConnectionInput): Promise<SaveConnectionResult> =>
      ipcRenderer.invoke('credentials:save', input),
    get: (id: string): Promise<GetConnectionResult> => ipcRenderer.invoke('credentials:get', id),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('credentials:delete', id),
    setMcpEnabled: (id: string, enabled: boolean): Promise<SetMcpEnabledResult> =>
      ipcRenderer.invoke('credentials:set-mcp-enabled', id, enabled),
    setConnectionPolicy: (id: string, policyId: string | null): Promise<SetConnectionPolicyResult> =>
      ipcRenderer.invoke('credentials:set-connection-policy', id, policyId),
    setBypassPolicyForOwnQueries: (id: string, bypass: boolean): Promise<SavedConnectionMeta | null> =>
      ipcRenderer.invoke('credentials:set-bypass-policy-for-own-queries', id, bypass),
    rename: (id: string, label: string): Promise<SavedConnectionMeta | null> =>
      ipcRenderer.invoke('credentials:rename', id, label),
  },
  // Named, user-creatable access policies -- each connection independently
  // selects which one applies to it (credentials.setConnectionPolicy above),
  // or none. Separate top-level namespace from `credentials`: this isn't
  // about any one saved connection. See credential-store.ts.
  accessPolicy: {
    list: (): Promise<AccessPolicy[]> => ipcRenderer.invoke('access-policy:list'),
    create: (name: string): Promise<AccessPolicy> => ipcRenderer.invoke('access-policy:create', name),
    rename: (id: string, name: string): Promise<AccessPolicy | null> =>
      ipcRenderer.invoke('access-policy:rename', id, name),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('access-policy:delete', id),
    setModuleEnabled: (policyId: string, type: AccessPolicyRule['type'], enabled: boolean): Promise<AccessPolicy | null> =>
      ipcRenderer.invoke('access-policy:set-module-enabled', policyId, type, enabled),
  },
  // See src/main/mcp/render-bridge.ts -- main sends the request, this
  // process runs `handler` and reports the result back correlated by
  // requestId. Only one handler is meant to be live at a time -- returning
  // an unsubscribe function (same pattern as onUpdateStatus/onDeepLink
  // above) is what makes that actually true. Without it (the original
  // version of this function, which called ipcRenderer.on with no way to
  // remove it), McpBridge.tsx's effect re-running for any reason -- React
  // Strict Mode's double-invoke, or a Fast Refresh during dev -- piled up
  // another listener on top of the last one instead of replacing it. Every
  // stale listener still fires on each new request, each closing over
  // whatever `handler` (and its captured GlobalStore) looked like at the
  // moment it was registered -- so a sufficiently long dev session could
  // intermittently get a response from a handler that predates a since-added
  // method, throwing "X is not a function" for what looks like no reason,
  // depending on which listener's response the main process happens to
  // receive first for a given request.
  mcp: {
    getSetupInfo: (): Promise<{ command: string; args: string[] }> => ipcRenderer.invoke('mcp:get-setup-info'),
    onQueryRequest: (handler: (request: McpQueryRequest) => Promise<unknown>) => {
      const listener = async (_event: Electron.IpcRendererEvent, request: McpQueryRequest) => {
        try {
          const result = await handler(request);
          // handler() returns MobX-observable state (Session.columns/rows are
          // observable fields -- see beamlynx-ui's store/mcp-query.ts), and
          // Electron's IPC send() uses the structured clone algorithm, which
          // cannot clone a MobX Proxy -- confirmed empirically: it throws
          // "An object could not be cloned." synchronously at the send()
          // call below if passed one directly. A JSON round-trip forces a
          // plain, guaranteed-cloneable copy; query results are inherently
          // JSON-shaped data anyway, so this loses nothing.
          const safeResult = JSON.parse(JSON.stringify(result));
          ipcRenderer.send('mcp:query-response', { requestId: request.requestId, ok: true, result: safeResult });
        } catch (e) {
          ipcRenderer.send('mcp:query-response', {
            requestId: request.requestId,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      };
      ipcRenderer.on('mcp:query-request', listener);
      return () => ipcRenderer.removeListener('mcp:query-request', listener);
    },
  },
  onDeepLink: (callback: (params: { connection?: string; expression?: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, params: { connection?: string; expression?: string }) =>
      callback(params);
    ipcRenderer.on('deep-link:open-query', listener);
    return () => ipcRenderer.removeListener('deep-link:open-query', listener);
  },
  // Lets main flush a deep link that arrived before this window's renderer
  // had mounted DeepLinkHandler (macOS open-url can fire pre-ready; a cold
  // Linux launch has the URL in argv before anything is set up).
  notifyRendererReady: () => ipcRenderer.send('renderer:ready'),
});
