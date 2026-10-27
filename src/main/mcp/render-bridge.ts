// Main process has no access to Session/MobX state -- only the renderer can
// actually execute a query into a visible tab (see beamlynx-ui's
// store/mcp-query.ts and components/McpBridge.tsx). This is the
// requestId-correlated round trip that makes that awaitable from main:
// main sends a request, the renderer runs it and reports back, main
// resolves the pending promise. There was no existing main->renderer->main
// round trip in this codebase to model on (every prior IPC round trip is
// renderer-initiated, via ipcRenderer.invoke/ipcMain.handle) -- this is new
// plumbing.
import { BrowserWindow, ipcMain, type WebContents } from 'electron';

const REQUEST_CHANNEL = 'mcp:query-request';
const RESPONSE_CHANNEL = 'mcp:query-response';
// Sent when a query runs out of time, so beamlynx-ui stops that run too.
const CANCEL_CHANNEL = 'mcp:query-cancel';
// beamlynx-ui's McpBridge sends this once it listens on every MCP channel.
const READY_CHANNEL = 'mcp:bridge-ready';
export const RESPONSE_TIMEOUT_MS = 60000;

export type McpQueryRequestPayload = {
  requestId: string;
  kind: 'eval' | 'build';
  profileId: string;
  expression: string;
  // Values for the expression's $variables, from run_query.
  variables?: Record<string, unknown>;
  // run_sql_as_pine's SQL, in place of an expression (then ''). beamlynx-ui
  // converts it to Pine and runs only the Pine.
  sql?: string;
  // Which Claude session this comes from (see investigations.ts). beamlynx-ui
  // runs each investigation's queries in that investigation's own tab.
  investigationId?: string;
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

// --- Is the page listening? ----------------------------------------------
//
// A request sent while the window shows loading.html, or while it reloads,
// reaches no listener and would wait out the whole timeout. So the page says
// when it listens (mcp:bridge-ready), and main stops counting on it the
// moment it navigates away, crashes or closes (watchBridge). The control
// plane answers 503 in between, instead of sending into a page that can't
// answer.

let bridgeReady = false;
let watched: WebContents | null = null;
const readyCallbacks: (() => void)[] = [];

export const NOT_READY_MESSAGE =
  'Beamlynx is still starting, or its window is reloading. Try again in a few seconds.';

export function isBridgeReady(): boolean {
  return bridgeReady;
}

/** Called each time the page becomes ready, including again after a reload. */
export function onBridgeReady(callback: () => void): void {
  readyCallbacks.push(callback);
}

// Going not-ready fails every request still waiting: the page that would
// have answered is gone.
export function setBridgeReady(ready: boolean): void {
  const was = bridgeReady;
  bridgeReady = ready;
  if (!ready) {
    for (const [requestId, entry] of pending) {
      pending.delete(requestId);
      clearTimeout(entry.timeout);
      entry.reject(new Error('The Beamlynx window reloaded before the query finished. Try again in a few seconds.'));
    }
    return;
  }
  if (!was) {
    for (const callback of readyCallbacks) {
      try {
        callback();
      } catch (e) {
        console.error('[mcp] bridge-ready callback failed:', e);
      }
    }
  }
}

let readyListenerRegistered = false;

// Follows the main window's page. Called once per window (createWindow in
// index.ts). Only that window's page can say it is ready.
export function watchBridge(window: BrowserWindow): void {
  const webContents = window.webContents;
  watched = webContents;
  setBridgeReady(false);
  if (!readyListenerRegistered) {
    readyListenerRegistered = true;
    ipcMain.on(READY_CHANNEL, event => {
      if (watched && event.sender === watched) setBridgeReady(true);
    });
  }
  const forget = () => {
    if (watched === webContents) setBridgeReady(false);
  };
  webContents.on('did-start-navigation', details => {
    if (details.isMainFrame && !details.isSameDocument) forget();
  });
  webContents.on('render-process-gone', forget);
  window.on('closed', () => {
    forget();
    if (watched === webContents) watched = null;
  });
}

let requestCounter = 0;

// Rejects at once while the page isn't ready (see above). The control plane
// checks first and answers 503, so this is the backstop.
//
// A query that takes longer than timeoutMs is cancelled in the page too
// (mcp:query-cancel). So is one whose caller gives up: `signal` aborts when
// the agent cancels its tool call (control-plane-server.ts).
export function runInRenderer(
  mainWindow: BrowserWindow,
  request: Omit<McpQueryRequestPayload, 'requestId'>,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<unknown> {
  ensureResponseListener();
  if (!bridgeReady) return Promise.reject(new Error(NOT_READY_MESSAGE));
  const requestId = `mcp-${Date.now()}-${++requestCounter}`;
  const timeoutMs = options.timeoutMs ?? RESPONSE_TIMEOUT_MS;
  const webContents = mainWindow.webContents;
  const cancel = () => {
    if (!webContents.isDestroyed()) webContents.send(CANCEL_CHANNEL, { requestId });
  };

  return new Promise((resolve, reject) => {
    const settle = () => {
      pending.delete(requestId);
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (!pending.has(requestId)) return;
      settle();
      cancel();
      reject(new Error('The query was cancelled.'));
    };
    const timeout = setTimeout(() => {
      settle();
      cancel();
      reject(new Error(`The query took longer than ${Math.round(timeoutMs / 1000)} s and was cancelled.`));
    }, timeoutMs);

    pending.set(requestId, {
      resolve: result => {
        settle();
        resolve(result);
      },
      reject: err => {
        settle();
        reject(err);
      },
      timeout,
    });
    if (options.signal?.aborted) return onAbort();
    options.signal?.addEventListener('abort', onAbort);
    webContents.send(REQUEST_CHANNEL, { ...request, requestId });
  });
}
