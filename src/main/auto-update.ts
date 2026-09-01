import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

// Re-check on this cadence for as long as the app stays open -- a launch-only
// check misses releases that ship while a session is left running for hours
// or days (this is a long-lived DB client, not something people relaunch
// often). A check is just a conditional fetch of a small metadata file, so
// there's no real cost to going this short; the actual benefit of staying
// short is that setInterval doesn't fire during sleep or catch up on wake,
// so a shorter interval keeps that blind spot small without needing a
// powerMonitor 'resume' hook to close it.
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

// Checks GitHub Releases (see electron-builder.yml's publish block),
// downloads in the background if a newer version is found, and applies the
// update the next time the app quits. Status is pushed to the renderer over
// the 'update-status' channel (see src/preload/index.ts) so beamlynx-ui can
// show it in-app -- deliberately not using checkForUpdatesAndNotify()'s
// built-in native OS notification, since that would be a second, redundant
// "an update is ready" surface alongside the in-app one.
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  // A dev/unpackaged build has no update metadata to check against --
  // this would just fail noisily every launch.
  if (!app.isPackaged) return;

  const send = (status: UpdateStatus) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', status);
    }
  };

  // Once a download finishes, further checks are pointless until the app
  // restarts to apply it -- stop polling rather than re-fetch the same
  // metadata on a timer.
  let updateReady = false;
  // Set while an update is downloading, so an interval tick mid-download
  // can't call checkForUpdates() again and start a second concurrent
  // downloadUpdate() (autoDownload defaults to true, so 'update-available'
  // already kicks off the download on its own).
  let downloadInProgress = false;

  autoUpdater.on('error', err => {
    console.error('Auto-update error:', err);
    downloadInProgress = false;
    send({ state: 'error', message: err.message });
  });
  autoUpdater.on('checking-for-update', () => {
    console.log('Auto-update: checking for update...');
    send({ state: 'checking' });
  });
  autoUpdater.on('update-available', info => {
    console.log('Auto-update: update available:', info.version);
    downloadInProgress = true;
    send({ state: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', info => {
    console.log('Auto-update: no update available, current is latest:', info.version);
    send({ state: 'not-available' });
  });
  autoUpdater.on('download-progress', progress => {
    const percent = Math.round(progress.percent);
    console.log(`Auto-update: downloading... ${percent}%`);
    send({ state: 'downloading', percent });
  });
  autoUpdater.on('update-downloaded', info => {
    console.log('Auto-update: update downloaded, will apply on next quit:', info.version);
    downloadInProgress = false;
    updateReady = true;
    send({ state: 'downloaded', version: info.version });
  });

  const check = () => {
    if (updateReady || downloadInProgress) return;
    autoUpdater.checkForUpdates().catch(err => {
      console.error('checkForUpdates failed:', err);
    });
  };

  check();
  const interval = setInterval(check, CHECK_INTERVAL_MS);
  mainWindow.on('closed', () => clearInterval(interval));
}
