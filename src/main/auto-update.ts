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

  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    console.error('checkForUpdatesAndNotify failed:', err);
  });
}
