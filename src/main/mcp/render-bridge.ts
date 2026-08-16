// Main process has no access to Session/MobX state -- only the renderer can
// actually execute a query into a visible tab (see beamlynx-ui's
// store/mcp-query.ts and components/McpBridge.tsx). This is the
// requestId-correlated round trip that makes that awaitable from main:
// main sends a request, the renderer runs it and reports back, main
// resolves the pending promise. There was no existing main->renderer->main
// round trip in this codebase to model on (every prior IPC round trip is
// renderer-initiated, via ipcRenderer.invoke/ipcMain.handle) -- this is new
// plumbing.
import { BrowserWindow, ipcMain } from 'electron';

const REQUEST_CHANNEL = 'mcp:query-request';
const RESPONSE_CHANNEL = 'mcp:query-response';
const RESPONSE_TIMEOUT_MS = 30000;

export type McpQueryRequestPayload = {
  requestId: string;
  kind: 'eval' | 'build';
  profileId: string;
  expression: string;
};

type PendingEntry = {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
};

const pending = new Map<string, PendingEntry>();
let listenerRegistered = false;

function ensureResponseListener(): void {
  if (listenerRegistered) return;
  listenerRegistered = true;
  ipcMain.on(RESPONSE_CHANNEL, (_event, payload: { requestId: string; ok: boolean; result?: unknown; error?: string }) => {
    const entry = pending.get(payload.requestId);
    if (!entry) return; // already timed out, or a stale/duplicate reply
    pending.delete(payload.requestId);
    clearTimeout(entry.timeout);
    if (payload.ok) {
      entry.resolve(payload.result);
    } else {
      entry.reject(new Error(payload.error ?? 'MCP query failed in renderer'));
    }
  });
}

let requestCounter = 0;

// Renderer isn't guaranteed to be ready (loading.html vs. the real UI, see
// index.ts's loadRealUi) -- callers should only invoke this once the main
// window has actually finished loading beamlynx-ui, which the control-plane
// server itself waits on before accepting requests.
export function runInRenderer(mainWindow: BrowserWindow, request: Omit<McpQueryRequestPayload, 'requestId'>): Promise<unknown> {
  ensureResponseListener();
  const requestId = `mcp-${Date.now()}-${++requestCounter}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('Timed out waiting for the renderer to run the MCP query'));
    }, RESPONSE_TIMEOUT_MS);

    pending.set(requestId, { resolve, reject, timeout });
    mainWindow.webContents.send(REQUEST_CHANNEL, { ...request, requestId });
  });
}
