import { app, BrowserWindow, net } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { AppUpdater } from 'electron-updater';
import {
  checkInstallAttempt,
  compareVersions,
  decideUpdateStatus,
  minimumFromFile,
  versionFromUpdateFile,
  type InstallAttempt,
  type UpdaterState,
  type UpdateStatus,
} from './update-decision';

export type { UpdateStatus } from './update-decision';

// electron-updater takes ~30 ms to load. It is loaded on first use, after the
// window and the pine server are already on their way, instead of while the
// app starts.
export function getAutoUpdater(): AppUpdater {
  return (require('electron-updater') as typeof import('electron-updater')).autoUpdater;
}

// Where a person downloads the app by hand, when it can't update itself.
export const DOWNLOAD_PAGE_URL = 'https://beamlynx.com/download';

// The newest release's update file, for when the updater failed before it
// said which version is out. Same repo as electron-builder.yml's publish
// block. A plain download, not GitHub's API, which allows only 60 requests
// an hour from one address: an office of users shares one. Signing plays no
// part in reading it, so unsigned builds get it too.
const LATEST_RELEASE_FILE = 'https://github.com/beamlynx/beamlynx-desktop/releases/latest/download/latest.yml';

// The oldest version allowed: desktop/minimum-version.json on main. Raising
// it is a PR (RELEASING.md, "Make everyone update"). GitHub serves this
// address from a cache for up to 5 minutes.
const MINIMUM_VERSION_FILE = 'https://raw.githubusercontent.com/beamlynx/beamlynx-desktop/main/desktop/minimum-version.json';

// null: no minimum. undefined: couldn't read it (offline, GitHub blocked, a
// broken file), so the app keeps what it knew.
async function fetchMinimumVersion(): Promise<string | null | undefined> {
  try {
    const res = await net.fetch(MINIMUM_VERSION_FILE);
    if (!res.ok) return undefined;
    return minimumFromFile(await res.text());
  } catch {
    return undefined;
  }
}

// Re-check on this cadence for as long as the app stays open -- a launch-only
// check misses releases that ship while a session is left running for hours
// or days (this is a long-lived DB client, not something people relaunch
// often). A check is just a conditional fetch of a small metadata file, so
// there's no real cost to going this short; the actual benefit of staying
// short is that setInterval doesn't fire during sleep or catch up on wake,
// so a shorter interval keeps that blind spot small without needing a
// powerMonitor 'resume' hook to close it.
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

const installAttemptFile = () => path.join(app.getPath('userData'), 'update-install-attempt.json');

function readInstallAttempt(): InstallAttempt | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(installAttemptFile(), 'utf8'));
    if (typeof parsed?.version === 'string' && typeof parsed?.launches === 'number') return parsed;
  } catch {
    // No file: no update is waiting to install.
  }
  return null;
}

function writeInstallAttempt(attempt: InstallAttempt | null): void {
  try {
    if (attempt) fs.writeFileSync(installAttemptFile(), JSON.stringify(attempt));
    else fs.rmSync(installAttemptFile(), { force: true });
  } catch (e) {
    console.error('Auto-update: could not write the install attempt:', e);
  }
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await net.fetch(LATEST_RELEASE_FILE);
    if (!res.ok) return null;
    return versionFromUpdateFile(await res.text());
  } catch {
    return null;
  }
}

// Checks GitHub Releases (see electron-builder.yml's publish block),
// downloads in the background if a newer version is found, and applies the
// update the next time the app quits. It also reads the oldest version that
// may still be used (desktop/minimum-version.json on main). What the window
// shows is worked out in update-decision.ts and pushed over the
// 'update-status' channel (see src/preload/index.ts) -- deliberately not
// using checkForUpdatesAndNotify()'s built-in native OS notification, since
// that would be a second, redundant surface alongside the in-app one.
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  // A dev/unpackaged build has no update metadata to check against --
  // this would just fail noisily every launch.
  if (!app.isPackaged) return;
  const autoUpdater = getAutoUpdater();
  const current = app.getVersion();

  let updater: UpdaterState = { kind: 'idle' };
  // Unknown (offline, or GitHub blocked) counts as no minimum:
  // nobody is ever locked out because a request failed.
  let minimumVersion: string | null = null;
  let lastSent = '';

  const send = () => {
    const status: UpdateStatus = decideUpdateStatus({ current, updater, minimumVersion });
    const json = JSON.stringify(status);
    if (json === lastSent || mainWindow.isDestroyed()) return;
    lastSent = json;
    mainWindow.webContents.send('update-status', status);
  };
  // The window asks again once its page has loaded, so a status sent while
  // the splash was showing isn't lost.
  mainWindow.webContents.on('did-finish-load', () => {
    lastSent = '';
    send();
  });

  const setUpdater = (next: UpdaterState) => {
    updater = next;
    send();
  };

  // A failure is only worth showing when a newer version is out.
  const fail = async (version: string | null) => {
    setUpdater({ kind: 'failed', version: version ?? (await fetchLatestVersion()) });
  };

  const { keep, failedVersion } = checkInstallAttempt(current, readInstallAttempt());
  writeInstallAttempt(keep);
  if (failedVersion) {
    console.error(`Auto-update: ${failedVersion} downloaded twice and didn't install.`);
    updater = { kind: 'failed', version: failedVersion };
  }
  const installFailed = () => failedVersion !== null;

  // The newest version the feed has offered, so a failed download can still
  // say which version to get.
  let offeredVersion: string | null = null;

  autoUpdater.on('error', err => {
    console.error('Auto-update error:', err);
    if (installFailed()) return;
    void fail(offeredVersion);
  });
  autoUpdater.on('checking-for-update', () => {
    console.log('Auto-update: checking for update...');
  });
  autoUpdater.on('update-available', info => {
    console.log('Auto-update: update available:', info.version);
    offeredVersion = info.version;
    if (installFailed()) return;
    setUpdater({ kind: 'downloading', version: info.version, percent: 0 });
  });
  autoUpdater.on('update-not-available', info => {
    console.log('Auto-update: no update available, current is latest:', info.version);
    setUpdater({ kind: 'up-to-date' });
  });
  autoUpdater.on('download-progress', progress => {
    if (installFailed() || updater.kind !== 'downloading') return;
    setUpdater({ ...updater, percent: Math.round(progress.percent) });
  });
  autoUpdater.on('update-downloaded', info => {
    console.log('Auto-update: update downloaded, will apply on next quit:', info.version);
    if (installFailed()) return;
    const previous = readInstallAttempt();
    writeInstallAttempt({ version: info.version, launches: previous?.version === info.version ? previous.launches : 0 });
    setUpdater({ kind: 'downloaded', version: info.version });
  });

  const checkMinimum = async () => {
    const minimum = await fetchMinimumVersion();
    if (minimum === undefined) return; // couldn't ask: keep what we knew
    if (minimum !== minimumVersion) console.log('Auto-update: oldest version allowed:', minimum ?? 'any');
    minimumVersion = minimum;
    send();
  };

  const checkUpdates = async () => {
    // Once an update is downloading or downloaded, or this copy can't
    // install updates, checking the feed again only repeats the same answer.
    if (updater.kind === 'downloading' || updater.kind === 'downloaded' || installFailed()) return;
    try {
      // null: the updater doesn't run in this copy, for example a Linux
      // build that is neither the AppImage nor the .deb.
      if (!autoUpdater.isUpdaterActive()) {
        const latest = await fetchLatestVersion();
        setUpdater(latest && compareVersions(latest, current) > 0 ? { kind: 'failed', version: latest } : { kind: 'up-to-date' });
        return;
      }
      await autoUpdater.checkForUpdates();
    } catch (err) {
      console.error('checkForUpdates failed:', err);
    }
  };

  // The minimum is read on every tick, even after an update downloaded, so
  // a copy left open for days still sees a raised minimum.
  const check = () => {
    void checkMinimum();
    void checkUpdates();
  };

  check();
  const interval = setInterval(check, CHECK_INTERVAL_MS);
  mainWindow.on('closed', () => clearInterval(interval));
}
