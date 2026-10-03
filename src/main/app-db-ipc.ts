// Puts the app's SQLite file (app-db.ts) in the shared data folder, next to
// connections.json, and exposes it to the renderer.
//
// Shared, not per copy: a dev build has its own data folder (data-dir.ts),
// but recipes are the user's own knowledge, like saved connections, so the
// installed app and a dev build see the same ones. That is safe because
// migrations only ever add tables and columns (see app-db.ts), so an older
// installed app keeps working on a file a newer dev build migrated.
//
// The file is not named or placed under a `databases` folder on purpose:
// Electron 32 and later delete <userData>/databases on startup (it was
// WebSQL's).
import { ipcMain } from 'electron';
import * as path from 'path';
import { AppDb, databaseKeyOf, openAppDb, type RecipeInputDef } from './app-db';
import { listConnections } from './credential-store';
import { getSharedDataDir } from './data-dir';

let appDb: AppDb | null = null;

export function getAppDbPath(): string {
  return path.join(getSharedDataDir(), 'beamlynx.db');
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
