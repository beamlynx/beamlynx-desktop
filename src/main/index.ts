import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import { initAutoUpdater } from './auto-update';
import { registerCredentialIpc } from './credential-store';
import { getResourcesRoot } from './resources';
import { ServerHandle, startServer } from './server-process';

let mainWindow: BrowserWindow | null = null;
let serverHandle: ServerHandle | null = null;
let quitting = false;

// Chromium's desktop-environment auto-detection (which safeStorage's Linux
// backend selection relies on) only recognizes a fixed list of DEs --
// GNOME, KDE, XFCE, Cinnamon, Unity, etc. On anything outside that list
// (tiling WMs like Hyprland, Sway, i3), it reports no key storage available
// at all, even when a real secret service (most commonly gnome-keyring) is
// running and reachable on the session bus -- confirmed empirically: with
// no override, safeStorage.isEncryptionAvailable() returns false under
// Hyprland despite gnome-keyring-daemon owning org.freedesktop.secrets.
// Force a backend explicitly instead of relying on that heuristic. Must run
// before the app is ready, so it's called at module load, before any
// app.on/app.whenReady registration below.
function configureLinuxPasswordStore(): void {
  if (process.platform !== 'linux') return;
  const desktop = `${process.env.XDG_CURRENT_DESKTOP ?? ''} ${process.env.DESKTOP_SESSION ?? ''}`.toLowerCase();
  const isKde = desktop.includes('kde') || !!process.env.KDE_SESSION_VERSION;
  app.commandLine.appendSwitch('password-store', isKde ? 'kwallet6' : 'gnome-libsecret');
}
configureLinuxPasswordStore();

// Electron's built-in default menu (used automatically whenever no menu is
// set) binds Cmd/Ctrl+W to role: 'close', which would intercept the
// keystroke natively and close the whole window before the renderer's own
// Ctrl+W "close tab" keybinding (see beamlynx-ui's utils/keybindings.ts)
// ever sees it. This template keeps the other standard roles (clipboard
// shortcuts on macOS in particular rely on the Edit menu existing) but
// deliberately omits a 'close' item so Ctrl/Cmd+W reaches the page.
function buildMenu(): Menu {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : [
          {
            label: 'File',
            submenu: [{ role: 'quit' as const }],
          },
        ]),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        ...(isMac ? [{ role: 'zoom' as const }, { type: 'separator' as const }, { role: 'front' as const }] : []),
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
    },
  });

  // Shown immediately, before the server is up -- see loadRealUi() below for
  // why this can't just be the real UI loaded early.
  mainWindow.loadFile(path.join(__dirname, '..', '..', 'assets', 'loading.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Swaps the loading screen for the real UI, once the server is confirmed
// ready. Loading the real UI before that point (instead of a splash) was
// considered and rejected: beamlynx-ui only shows a brief "Connecting..."
// state for its first (near-instant) failed request, then falls through to
// "Pine server is not running" for any repeat user whose local storage
// already has onboardingServer=true from a prior successful connection --
// that's a worse first impression during the several-second JVM boot than
// a simple splash.
// Chromium buffers localStorage writes in memory and only periodically
// flushes them to disk -- it doesn't happen on every write. An abrupt quit
// (exactly what auto-update does: quit, replace the binary, relaunch) can
// race that flush and lose whatever the renderer had just written, which
// looks like user preferences (vim mode, sidebar width, theme, etc. -- see
// beamlynx-ui's store/preferences.ts) silently reverting after an update.
// Call this before every quit path so pending writes are forced to disk
// first.
function flushRendererStorage(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.session.flushStorageData();
  }
}

function loadRealUi(): void {
  if (!mainWindow) return;

  // Dev-only escape hatch: point the window at a running `next dev` server
  // instead of the staged static export, so UI changes hot-reload without
  // rerunning build-ui-export.sh (a full static rebuild) on every edit.
  // Doesn't apply to a packaged app -- BEAMLYNX_DEV_UI_URL is just not set
  // there. See beamlynx-desktop's DEVELOPMENT.md.
  const devUiUrl = process.env.BEAMLYNX_DEV_UI_URL;
  if (devUiUrl) {
    mainWindow.loadURL(devUiUrl);
  } else {
    mainWindow.loadFile(path.join(getResourcesRoot(), 'ui', 'index.html'));
  }
}

async function main(): Promise<void> {
  Menu.setApplicationMenu(buildMenu());
  registerCredentialIpc();

  // Show the window (with a loading splash) immediately instead of waiting
  // on startServer() (JVM boot + port-readiness polling, up to ~15s) --
  // previously nothing rendered at all during that gap.
  createWindow();

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

  loadRealUi();
  if (mainWindow) {
    initAutoUpdater(mainWindow);
  }
}

// Triggered by the renderer's "Restart to install" button (see
// beamlynx-ui's DesktopUpdateBanner). Stops the server and marks `quitting`
// ourselves first, same as a normal quit -- so that by the time
// quitAndInstall() gets to firing its own 'before-quit', our handler below
// just no-ops instead of calling event.preventDefault() and interfering
// with electron-updater's native install-and-relaunch handoff.
ipcMain.on('restart-to-update', async () => {
  quitting = true;
  flushRendererStorage();
  if (serverHandle) {
    await serverHandle.stop();
  }
  autoUpdater.quitAndInstall();
});

app.on('ready', main);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', async event => {
  if (quitting || !serverHandle) return;
  quitting = true;
  event.preventDefault();
  flushRendererStorage();
  await serverHandle.stop();
  app.quit();
});
