import { app } from 'electron';
import { autoUpdater } from 'electron-updater';

// checkForUpdatesAndNotify(): checks GitHub Releases (see electron-builder.yml's
// publish block), downloads in the background if a newer version is found,
// shows a native OS notification once ready, and applies the update the next
// time the app quits -- the standard electron-updater pattern, no custom UI.
export function initAutoUpdater(): void {
  // A dev/unpackaged build has no update metadata to check against --
  // this would just fail noisily every launch.
  if (!app.isPackaged) return;

  autoUpdater.on('error', err => {
    console.error('Auto-update error:', err);
  });
  autoUpdater.on('checking-for-update', () => {
    console.log('Auto-update: checking for update...');
  });
  autoUpdater.on('update-available', info => {
    console.log('Auto-update: update available:', info.version);
  });
  autoUpdater.on('update-not-available', info => {
    console.log('Auto-update: no update available, current is latest:', info.version);
  });
  autoUpdater.on('download-progress', progress => {
    console.log(`Auto-update: downloading... ${Math.round(progress.percent)}%`);
  });
  autoUpdater.on('update-downloaded', info => {
    console.log('Auto-update: update downloaded, will apply on next quit:', info.version);
  });

  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    console.error('checkForUpdatesAndNotify failed:', err);
  });
}
