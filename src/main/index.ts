import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as http from 'http';
import * as path from 'path';
import { initAutoUpdater } from './auto-update';
import { registerCredentialIpc } from './credential-store';
import { startControlPlaneServer } from './mcp/control-plane-server';
import { startMcpRelay } from './mcp/stdio-relay';
import { getResourcesRoot } from './resources';
import { ServerHandle, startServer } from './server-process';

let mainWindow: BrowserWindow | null = null;
let serverHandle: ServerHandle | null = null;
let controlPlaneServer: http.Server | null = null;
let quitting = false;

// `beamlynx --app-version` should just print the desktop app's own version
// and exit - not launch the GUI, not contend for the single-instance lock
// below. Deliberately NOT `--version`/`-v`: those are Chromium/Electron's
// own reserved switches, consumed natively before any of this file's JS
// ever runs - confirmed live: `electron dist/main/index.js --version`
// printed Electron's *own* framework version ("31.7.7"), not the app's, and
// the packaged AppImage produced no output at all for the same flag. There
// is no way to override that from application code - it's handled below
// the JS layer. A differently-named flag sidesteps the collision entirely.
// `app.getVersion()` reads straight from the bundled package.json (see
// app-builder-lib's handling), so it's already correct with no extra
// wiring. `process.exit`, not `app.exit`/`app.quit` - this needs to be an
// immediate, synchronous stop before any of Electron's async startup/
// lifecycle machinery (single-instance lock, menu, server process) gets a
// chance to do anything.
if (process.argv.includes('--app-version')) {
  console.log(app.getVersion());
  process.exit(0);
}

// `beamlynx --mcp` is what Claude Code/Claude Desktop actually spawn (see
// beamlynx-plans/pending/2026-08-15-mcp-server-and-url-scheme.md) -- a thin
// stdio relay, not a second GUI. Checked before anything else in this file
// runs: it must never contend for the single-instance lock below (that's
// the GUI's lock to hold), never create a window, and must have nothing
// else in this module's normal startup path racing it.
if (process.argv.includes('--mcp')) {
  startMcpRelay().catch(err => {
    console.error('[mcp] fatal error starting MCP relay:', err);
    process.exit(1);
  });
} else {
  runDesktopApp();
}

// --- Deep link handling (beamlynx://run?connection=<id>&expression=<pine-expr>) ---
// A click can arrive before the renderer -- or even the window -- exists:
// macOS's open-url can fire pre-ready, and a cold Linux launch already has
// the URL sitting in argv before anything is set up. Queue it and flush
// once the renderer signals it has mounted (see the 'renderer:ready' IPC
// handler in runDesktopApp below), rather than dropping a cold-start click
// silently.
let pendingDeepLink: { connection?: string; expression?: string } | null = null;
let rendererReady = false;

function parseDeepLink(url: string): { connection?: string; expression?: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'beamlynx:') return null;
    return {
      connection: parsed.searchParams.get('connection') ?? undefined,
      expression: parsed.searchParams.get('expression') ?? undefined,
    };
  } catch {
    return null;
  }
}

function handleDeepLink(url: string): void {
  const params = parseDeepLink(url);
  if (!params) return;
  if (rendererReady && mainWindow) {
    mainWindow.webContents.send('deep-link:open-query', params);
  } else {
    pendingDeepLink = params;
  }
}

function findDeepLinkArg(argv: string[]): string | undefined {
  return argv.find(arg => arg.startsWith('beamlynx://'));
}

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

// Windows/Linux: no menu bar at all. It only ever duplicated beamlynx-ui's
// own header (search, connection picker, settings) with a generic
// File/Edit/View/Window strip, and Ctrl+C/V/X/Z work fine in Chromium text
// fields on these platforms without a Menu -- Menu.setApplicationMenu(null)
// is Electron's own documented way to remove it (has no effect on macOS,
// handled separately below). This still needs to be an explicit null, not
// just skipping the setApplicationMenu call below entirely -- an app that
// never calls it at all falls back to Electron's own built-in default menu,
// which binds Ctrl+W to role: 'close' and would intercept it before the
// renderer's own "close tab" keybinding ever saw it (see
// beamlynx-ui's utils/keybindings.ts). Passing null removes the menu bar
// with no accelerators of its own, so there's nothing left to intercept it.
//
// macOS is different: Cmd+C/V/X and undo/redo in text fields are wired
// through the Edit menu's roles as native accelerators, so an app with no
// Menu at all silently loses them -- a well-documented Electron gotcha, not
// specific to this app. Kept minimal for that reason alone: the app-name
// menu (About/Hide/Quit, expected on every Mac app regardless) plus a bare
// Edit menu. View/Window (reload/zoom/devtools/fullscreen/minimize) are
// dropped -- they're not needed for clipboard/undo to work, and
// beamlynx-ui's own UI doesn't expose equivalents either.
function buildMenu(): Menu | null {
  if (process.platform !== 'darwin') {
    return null;
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    // A BrowserWindow shown immediately (Electron's default) paints blank/
    // white for a brief moment before its first frame -- loading.html hasn't
    // loaded and rendered yet. backgroundColor matches loading.html's own
    // background (assets/loading.html, itself matched to beamlynx-ui's dark
    // theme default) so there's a solid, correctly-colored window from the
    // instant it appears, and show only once that first frame is actually
    // ready to display.
    show: false,
    backgroundColor: '#21252b',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Without this, an external link (e.g. beamlynx.com in the Settings
  // About section) navigates the app's own window in place instead of
  // opening in the user's actual browser -- Electron's default for
  // target="_blank"/window.open with no handler.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // file:// covers the packaged static export (loading.html -> index.html,
    // and index.html's own loads); same-origin covers the dev-mode
    // `next dev` server (BEAMLYNX_DEV_UI_URL, see loadRealUi() below) hot
    // reloading itself. Everything else is an outbound link -- the app has
    // no legitimate reason to navigate its own window anywhere else.
    const target = new URL(url);
    if (target.protocol === 'file:') return;
    const current = new URL(mainWindow?.webContents.getURL() ?? '');
    if (target.origin === current.origin) return;
    event.preventDefault();
    shell.openExternal(url);
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
// can race that flush and lose whatever the renderer had just written,
// which looks like user preferences (vim mode, sidebar width, theme, etc.
// -- see beamlynx-ui's store/preferences.ts) or saved connections silently
// reverting/disappearing after a restart. Call this before every quit path
// so pending writes are forced to disk first.
//
// Uses session.defaultSession rather than mainWindow.webContents.session --
// confirmed empirically that mainWindow is already null by the time this
// matters for a normal window-close quit: Electron's window 'closed' event
// (which nulls out our reference, see createWindow() below) fires before
// 'window-all-closed'/'before-quit' does, so a mainWindow-guarded flush
// silently no-ops on that path. It only ever worked for the
// restart-to-update path below, where the renderer is still alive when
// it's called (the IPC message that triggers it could only have been sent
// by a live renderer) -- not a real fix for the more common "just close
// the window" quit.
//
// flushStorageData() itself has no completion signal (fire-and-forget), so
// a short grace delay follows to give the actual disk write a chance to
// land before the process exits for real.
async function flushRendererStorage(): Promise<void> {
  session.defaultSession.flushStorageData();
  await new Promise(resolve => setTimeout(resolve, 300));
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

  // Started here rather than after the server/UI are up -- it only starts
  // accepting real work once a run_query/explain_query request actually
  // arrives and finds mainWindow set (see control-plane-server.ts), so
  // there's no ordering requirement with startServer()/loadRealUi() below.
  controlPlaneServer = startControlPlaneServer({ getMainWindow: () => mainWindow });

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

// Everything that constitutes the normal GUI app -- pulled into its own
// function (rather than left at module top level, as it was before the
// --mcp relay existed) so the branch above can skip all of it entirely for
// `beamlynx --mcp`. A hoisted function declaration, so calling it before its
// textual definition (see the branch above) is fine -- same reason
// buildMenu/createWindow/etc. above can be declared after their call sites.
function runDesktopApp(): void {
  // Registered before any app.whenReady()-gated work below, per Electron's
  // own requirement for 'open-url' (macOS can fire it pre-ready). Harmless
  // to call on other platforms; setAsDefaultProtocolClient no-ops there
  // without an electron-builder `protocols` registration to back it, and
  // the Linux/deb case (the only Linux target this handles registration
  // for -- see electron-builder.yml) instead delivers the URL via argv,
  // handled below.
  app.setAsDefaultProtocolClient('beamlynx');
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  // Without this, nothing stops a second instance from launching against the
  // same userData dir (e.g. a stale process left behind by a crash or a
  // SIGKILL that the pine-server.pid handling below already has to account
  // for on the server side, or simply double-clicking the launcher). Two
  // live instances each hold their own in-memory copy of the renderer's
  // localStorage; whichever one's Chromium session happens to flush to disk
  // *last* wins, silently overwriting newer changes from the other with
  // stale data -- this is a well-documented Electron footgun, not specific
  // to this app. requestSingleInstanceLock() makes any second launch quit
  // immediately instead, and focuses the already-running window so it's not
  // just a silent no-op from the user's perspective.
  const gotSingleInstanceLock = app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    app.quit();
    return;
  }

  app.on('second-instance', (_event, argv) => {
    const deepLinkArg = findDeepLinkArg(argv);
    if (deepLinkArg) {
      handleDeepLink(deepLinkArg);
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Cold start on Linux: a beamlynx:// click that launched this process
  // (rather than reaching an already-running one via second-instance above)
  // has the URL sitting in argv from the very first launch.
  const coldStartDeepLink = findDeepLinkArg(process.argv);
  if (coldStartDeepLink) {
    handleDeepLink(coldStartDeepLink);
  }

  configureLinuxPasswordStore();

  // Signals that the renderer has mounted DeepLinkHandler and is ready to
  // receive 'deep-link:open-query' -- flushes anything that arrived before
  // this point (open-url pre-ready, or the cold-start argv check above).
  ipcMain.on('renderer:ready', () => {
    rendererReady = true;
    if (pendingDeepLink && mainWindow) {
      mainWindow.webContents.send('deep-link:open-query', pendingDeepLink);
      pendingDeepLink = null;
    }
  });

  // Backs the Settings "MCP setup instructions" panel -- the executable path
  // varies by install location and packaging format (.app bundle vs.
  // deb-installed binary), so it's resolved at click time here rather than
  // baked into any static instructions text.
  //
  // Packaged vs. dev mode need different args, not just a different path:
  // in a packaged build, process.execPath is the final, single-purpose
  // binary, so `<path> --mcp` alone is a complete invocation. In dev mode
  // (`npm run start` -> `electron .`), process.execPath is the raw Electron
  // binary from node_modules. Electron needs an app directory argument to
  // know which package.json's `main` to load -- without one, it never
  // reaches this file's `--mcp` check at all, so spawning just `--mcp`
  // alone gives it no app to load. app.getAppPath() resolves to that
  // directory in dev (and to the packaged
  // app's root when packaged, where this branch isn't taken anyway).
  ipcMain.handle('mcp:get-setup-info', () => {
    if (app.isPackaged) {
      return { command: process.execPath, args: ['--mcp'] };
    }
    return { command: process.execPath, args: [app.getAppPath(), '--mcp'] };
  });

  // Backs the Settings About section's "App version" row -- app.getVersion()
  // reads package.json's own version field, same value `beamlynx --app-version`
  // prints from the CLI.
  ipcMain.handle('app:get-version', () => app.getVersion());

  // Triggered by the renderer's "Restart to install" button (see
  // beamlynx-ui's DesktopUpdateBanner). Stops the server and marks
  // `quitting` ourselves first, same as a normal quit -- so that by the
  // time quitAndInstall() gets to firing its own 'before-quit', our handler
  // below just no-ops instead of calling event.preventDefault() and
  // interfering with electron-updater's native install-and-relaunch
  // handoff.
  ipcMain.on('restart-to-update', async () => {
    quitting = true;
    await flushRendererStorage();
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
    controlPlaneServer?.close();
    await flushRendererStorage();
    await serverHandle.stop();
    app.quit();
  });
}
