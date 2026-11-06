import { runInAction } from 'mobx';
import type { GlobalStore } from '../../store/global.store';
import type { ConnectionInfo } from '../../store/client';
import { recipeText, savedFromConnection, textToInsert, type Recipe } from '../../utils/recipes';

/**
 * Puts a recipe's query at the end of the active tab, as plain text. Nothing
 * runs. Shared by Ctrl+O's picker (RecipePickerModal) and the sidebar's
 * Library (LibraryPanel), so the two never insert differently.
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
  const existing = session.expression.replace(/\s+$/, '');
  const prefix = existing ? `${existing}\n\n` : '';
  const full = prefix + textToInsert(existing, recipeText(r));
  session.setExpressionWithSelection(full, { anchor: full.length, head: full.length });
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
 * Use: a recipe goes onto the database it was saved from. When that is
 * another of your connections, it opens in a new tab connected there;
 * otherwise, or with `here`, it goes at the end of the active tab
 * (insertRecipe). A recipe from a database you have no connection to also
 * goes in the active tab. Nothing runs.
 *
 * Returns the id of the tab it went into. Throws when the connection fails;
 * the new tab stays, empty, on it.
 */
// Not named use…: React's lint rule would take a use… function for a hook.
export async function openRecipe(global: GlobalStore, r: Recipe, here = false): Promise<string | null> {
  const home = here ? undefined : recipeHome(global, r);
  if (!home) return insertRecipe(global, r);
  runInAction(() => global.addTab());
  // Connected first, so the query builds against its own database.
  await global.connectToSavedProfile(home.id);
  return insertRecipe(global, r);
}
