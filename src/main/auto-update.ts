import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

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

  autoUpdater.on('error', err => {
    console.error('Auto-update error:', err);
    send({ state: 'error', message: err.message });
  });
  autoUpdater.on('checking-for-update', () => {
    console.log('Auto-update: checking for update...');
    send({ state: 'checking' });
  });
  autoUpdater.on('update-available', info => {
    console.log('Auto-update: update available:', info.version);
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
    send({ state: 'downloaded', version: info.version });
  });

  autoUpdater.checkForUpdates().catch(err => {
    console.error('checkForUpdates failed:', err);
  });
}
