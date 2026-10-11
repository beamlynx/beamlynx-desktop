// Puts the app's SQLite file (app-db.ts) in this copy's own data folder and
// exposes it to the renderer.
//
// Per copy, not shared: a dev build (data-dir.ts) has its own file, so
// experiments there, including new migrations, never touch the installed
// app's settings and recipes. The installed app's file changes only through
// the migrations a release brings. Saved connections are the exception and
// stay shared (credential-store.ts).
//
// The file is not named or placed under a `databases` folder on purpose:
// Electron 32 and later delete <userData>/databases on startup (it was
// WebSQL's).
import { app, ipcMain } from 'electron';
import * as path from 'path';
import { AppDb, databaseKeyOf, loadStartupState, openAppDb, type RecipeInputDef } from './app-db';
import { listConnections } from './credential-store';

let appDb: AppDb | null = null;
// Why the last open failed, logged once rather than on every call that
// needs the database (a locked or read-only file, a full disk).
let openFailure: string | null = null;

export function getAppDbPath(): string {
  return path.join(app.getPath('userData'), 'beamlynx.db');
}

// Opened on first use, so a launch that never touches it pays nothing.
export function getAppDb(): AppDb {
  if (!appDb) {
    try {
      appDb = openAppDb(getAppDbPath());
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      if (reason !== openFailure) {
        openFailure = reason;
        console.error(`[app-db] couldn't open ${getAppDbPath()}: ${reason}`);
      }
      throw new Error(`beamlynx couldn't open its data file (${getAppDbPath()}): ${reason}`);
    }
    openFailure = null;
    console.log(`[app-db] opened ${getAppDbPath()}`);
  }
  return appDb;
}

export function closeAppDb(): void {
  appDb?.close();
  appDb = null;
}

// Which database a saved connection points at, recorded on a recipe as where
// it was saved from.
function databaseKeyForConnection(connectionId: string): string | null {
  const meta = listConnections().find(c => c.id === connectionId);
  return meta ? databaseKeyOf(meta) : null;
}

type SaveRecipeFromApp = {
  id?: string;
  title: string;
  explanation?: string;
  expression: string;
  inputs?: RecipeInputDef[];
};

export function registerAppDbIpc(): void {
  // Synchronous on purpose: the preload calls it once, before the page's
  // scripts run, so the UI's stores can read preferences synchronously.
  // returnValue must always be set, or the renderer blocks for good.
  ipcMain.on('app-db:load-startup-state', event => {
    event.returnValue = loadStartupState(getAppDb);
  });
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

  // Recipes are global: every recipe is offered on every database (see
  // app-db.ts). Saved from the app, so the person is the author and the
  // source. The connection, when given, is recorded as where it was saved.
  ipcMain.handle('recipes:list', () => getAppDb().listRecipes());
  ipcMain.handle('recipes:find', (_event, text: string) => getAppDb().findRecipes(text));
  ipcMain.handle('recipes:get', (_event, id: string) => getAppDb().getRecipe(id));
  ipcMain.handle('recipes:save', (_event, input: SaveRecipeFromApp, connectionId?: string) =>
    getAppDb().saveRecipe({
      ...input,
      savedFrom: !input.id && connectionId ? databaseKeyForConnection(connectionId) : null,
      author: 'local',
      source: 'person',
      agent: null,
    }),
  );
  ipcMain.handle('recipes:delete', (_event, id: string) => getAppDb().deleteRecipe(id));
}
