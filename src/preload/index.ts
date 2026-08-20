// Intentionally minimal: the UI talks to the bundled server via plain
// fetch() against http://localhost:33333 (see beamlynx-ui/store/client.ts),
// same as it does against a Docker-run server today. The one thing the web
// UI genuinely can't do itself is know about Electron's auto-update
// lifecycle (see src/main/auto-update.ts) -- that's exposed here so
// beamlynx-ui can show it in-app instead of it being silent/console-only.
import { contextBridge, ipcRenderer } from 'electron';
import type { UpdateStatus } from '../main/auto-update';
import type {
  CredentialsStatus,
  GetConnectionResult,
  SaveConnectionInput,
  SaveConnectionResult,
  SavedConnectionMeta,
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
    setMcpEnabled: (id: string, enabled: boolean): Promise<SavedConnectionMeta | null> =>
      ipcRenderer.invoke('credentials:set-mcp-enabled', id, enabled),
    rename: (id: string, label: string): Promise<SavedConnectionMeta | null> =>
      ipcRenderer.invoke('credentials:rename', id, label),
  },
  // See src/main/mcp/render-bridge.ts -- main sends the request, this
  // process runs `handler` and reports the result back correlated by
  // requestId. Only one handler is ever registered (McpBridge.tsx, once, at
  // app startup).
  mcp: {
    getSetupInfo: (): Promise<{ command: string; args: string[] }> => ipcRenderer.invoke('mcp:get-setup-info'),
    onQueryRequest: (handler: (request: McpQueryRequest) => Promise<unknown>) => {
      ipcRenderer.on('mcp:query-request', async (_event, request: McpQueryRequest) => {
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
      });
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
