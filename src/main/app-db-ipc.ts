// Puts the app's SQLite file (app-db.ts) in this copy's data folder and
// exposes it to the renderer. A dev build has its own data folder (see
// data-dir.ts), so it gets its own file and never migrates the installed
// app's.
//
// The file is not named or placed under a `databases` folder on purpose:
// Electron 32 and later delete <userData>/databases on startup (it was
// WebSQL's).
import { app, ipcMain } from 'electron';
import * as path from 'path';
import { AppDb, openAppDb } from './app-db';

let appDb: AppDb | null = null;

export function getAppDbPath(): string {
  return path.join(app.getPath('userData'), 'beamlynx.db');
}

// Opened on first use, so a launch that never touches it pays nothing.
export function getAppDb(): AppDb {
  if (!appDb) {
    appDb = openAppDb(getAppDbPath());
    console.log(`[app-db] opened ${getAppDbPath()}`);
  }
  return appDb;
}

export function closeAppDb(): void {
  appDb?.close();
  appDb = null;
}

export function registerAppDbIpc(): void {
  ipcMain.handle('app-db:status', () => getAppDb().status());
  ipcMain.handle('app-db:load-preferences', () => getAppDb().loadPreferences());
  ipcMain.handle('app-db:set-preferences', (_event, changes: Record<string, string | null>) =>
    getAppDb().setPreferences(changes),
  );
  ipcMain.handle('app-db:get-column-widths', (_event, connection: string) =>
    getAppDb().getColumnWidths(connection),
  );
  ipcMain.handle(
    'app-db:set-column-widths',
    (_event, connection: string, changes: Record<string, number | null>) =>
      getAppDb().setColumnWidths(connection, changes),
  );
  ipcMain.handle('app-db:mark-imported-from-local-storage', () => getAppDb().markImportedFromLocalStorage());
}
