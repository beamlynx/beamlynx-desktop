import { app, BrowserWindow, dialog } from 'electron';
import * as path from 'path';
import { ServerHandle, startServer } from './server-process';

let mainWindow: BrowserWindow | null = null;
let serverHandle: ServerHandle | null = null;
let quitting = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
    },
  });

  // M2: no bundled UI yet -- point at the bundled server directly so this
  // milestone proves spawn/readiness/lifecycle without depending on M3's
  // static UI export. Replaced by resources/ui/index.html in M3.
  mainWindow.loadURL('http://localhost:33333/api/v1/connections');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function main(): Promise<void> {
  try {
    serverHandle = await startServer();
  } catch (err) {
    dialog.showErrorBox('beamlynx failed to start', err instanceof Error ? err.message : String(err));
    app.quit();
    return;
  }

  serverHandle.onUnexpectedExit(({ code, signal, stderrTail }) => {
    if (quitting) return;
    dialog.showErrorBox(
      'The pine server stopped unexpectedly',
      `Exit code: ${code}, signal: ${signal}\n\n${stderrTail || '(no stderr output captured)'}`,
    );
  });

  createWindow();
}

app.on('ready', main);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', async event => {
  if (quitting || !serverHandle) return;
  quitting = true;
  event.preventDefault();
  await serverHandle.stop();
  app.quit();
});
