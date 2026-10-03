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

// Which database a saved connection reaches: its own address, unless the
// user linked it to another one (an SSH tunnel to a remote database, say).
export function databaseKeyForConnection(connectionId: string): string {
  const meta = listConnections().find(c => c.id === connectionId);
  if (!meta) throw new Error('That saved connection no longer exists');
  return getAppDb().getDatabaseLink(connectionId) ?? databaseKeyOf(meta);
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

  // Recipes. The renderer names a saved connection; the main process works
  // out which database that is, so the renderer can't file a recipe under a
  // database it didn't pick.
  ipcMain.handle('recipes:database-key', (_event, connectionId: string) => databaseKeyForConnection(connectionId));
  ipcMain.handle('recipes:list', (_event, connectionId: string) =>
    getAppDb().listRecipes(databaseKeyForConnection(connectionId)),
  );
  ipcMain.handle('recipes:find', (_event, connectionId: string, text: string) =>
    getAppDb().findRecipes(databaseKeyForConnection(connectionId), text),
  );
  ipcMain.handle('recipes:get', (_event, id: string) => getAppDb().getRecipe(id));
  // Saved from the app, so the person is the author and the source.
  ipcMain.handle('recipes:save', (_event, connectionId: string, input: SaveRecipeFromApp) => {
    const databaseKey = databaseKeyForConnection(connectionId);
    if (input.id) {
      const existing = getAppDb().getRecipe(input.id);
      if (!existing || existing.databaseKey !== databaseKey) throw new Error('That recipe belongs to another database');
    }
    return getAppDb().saveRecipe({ ...input, databaseKey, author: 'local', source: 'person', agent: null });
  });
  ipcMain.handle('recipes:delete', (_event, id: string) => getAppDb().deleteRecipe(id));
  ipcMain.handle('recipes:link-connection', (_event, connectionId: string, databaseKey: string | null) => {
    if (!listConnections().some(c => c.id === connectionId)) throw new Error('That saved connection no longer exists');
    getAppDb().setDatabaseLink(connectionId, databaseKey);
  });
}
