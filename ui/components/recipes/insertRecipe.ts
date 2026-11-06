import { runInAction } from 'mobx';
import type { GlobalStore } from '../../store/global.store';
import type { ConnectionInfo } from '../../store/client';
import { insertAtCursor, recipeText, savedFromConnection, textToInsert, type Recipe } from '../../utils/recipes';

/**
 * Puts a recipe's query into the active tab at the cursor, as blocks of its
 * own (insertAtCursor), and leaves the cursor at its end. Nothing runs.
 * Shared by Ctrl+O's picker (RecipePickerModal) and the sidebar's Library
 * (LibraryPanel), so the two never insert differently.
 *
 * The Agent and Needs approval tabs belong to the agent, and the next agent
 * query overwrites them, so a recipe goes into a new tab instead.
 *
 * Returns the id of the tab it went into, or null when there is none.
 */
export function insertRecipe(global: GlobalStore, r: Recipe): string | null {
  if (global.agentSessionIds.includes(global.activeSessionId)) global.addTab();
  const session = global.sessions[global.activeSessionId];
  if (!session) return null;
  const existing = session.expression;
  const { text, cursor } = insertAtCursor(
    existing,
    session.cursorPosition?.line,
    textToInsert(existing, recipeText(r)),
  );
  session.setExpressionWithSelection(text, { anchor: cursor, head: cursor });
  return session.id;
}

/**
 * The saved connection a recipe was saved from, when it is one of yours and
 * not the one the active tab is on. Use then opens the recipe there.
 */
export function recipeHome(global: GlobalStore, r: Recipe): ConnectionInfo | undefined {
  const home = savedFromConnection(r.savedFrom, global.connections);
  return home && home.id !== global.sessions[global.activeSessionId]?.profileId ? home : undefined;
}

/**
 * Where Use puts a recipe saved from another of your connections (see
 * RecipeDatabaseDialog, which asks):
 * - switch: the active tab moves to the recipe's database, and the query
 *   goes at its end. The default.
 * - new: a new tab, connected to the recipe's database.
 * - here: the active tab, on the database it is on, such as staging.
 */
export type RecipeTarget = 'switch' | 'new' | 'here';

/**
 * Use: puts a recipe's query in a tab, as `target` says. A recipe already
 * on the active tab's database, or saved from one you have no connection
 * to, always goes into the active tab at the cursor (insertRecipe). Nothing runs.
 *
 * Returns the id of the tab it went into. Throws when the connection fails.
 */
// Not named use…: React's lint rule would take a use… function for a hook.
export async function openRecipe(global: GlobalStore, r: Recipe, target: RecipeTarget = 'here'): Promise<string | null> {
  const home = target === 'here' ? undefined : recipeHome(global, r);
  if (!home) return insertRecipe(global, r);
  // An agent's tab is never switched: its next query would overwrite it.
  if (target === 'new' || global.agentSessionIds.includes(global.activeSessionId)) {
    runInAction(() => global.addTab());
  }
  // Connected first, so the query builds against its own database.
  await global.connectToSavedProfile(home.id);
  return insertRecipe(global, r);
}
