import { app } from 'electron';
import * as path from 'path';

// The installed app and a dev build (`npm start`) both default to the same
// data folder, <appData>/beamlynx-desktop. The folder is named after
// package.json's `name`, not electron-builder's productName, so packaging
// doesn't change it.
//
// Sharing that folder meant a dev build could never start while the
// installed app was open. The installed app held the folder's
// single-instance lock, so the dev build quit without a word. Had it got
// past the lock, it would have killed the installed app's server through
// the shared pine-server.pid.
//
// So a dev build gets its own folder. Saved connections stay shared, see
// getSharedDataDir(). This must run before anything reads userData,
// including requestSingleInstanceLock() and the --mcp relay.
export function useSeparateDevDataDir(): void {
  if (app.isPackaged) return;
  app.setPath('userData', path.join(app.getPath('appData'), `${app.getName()}-dev`));
}

// The installed app's data folder. A dev build keeps its saved connections
// here too, so both copies see the same list.
export function getSharedDataDir(): string {
  return path.join(app.getPath('appData'), app.getName());
}
