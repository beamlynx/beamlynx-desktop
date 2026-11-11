import { runInAction } from 'mobx';
import type { GlobalStore } from '../../store/global.store';
import type { ConnectionInfo } from '../../store/client';
import { insertAtCursor, recipeText, savedFromConnection, textToInsert, type Recipe } from '../../utils/recipes';

/**
 * Puts a recipe's query into the active tab at the cursor, as blocks of its
 * own (insertAtCursor), and leaves the cursor at its end. Nothing runs.
 * Used by the Library (LibraryPanel), which the sidebar and Ctrl+O open.
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
 * not the one the active tab is on. Use then asks whether to use the recipe
 * here or open it there, in a new tab (RecipeDatabaseDialog).
 */
export function recipeHome(global: GlobalStore, r: Recipe): ConnectionInfo | undefined {
  const home = savedFromConnection(r.savedFrom, global.connections);
  return home && home.id !== global.activeConnectionId ? home : undefined;
}

/**
 * Where a recipe's query goes:
 * - here: the active tab at the cursor, on the database it is on, such as
 *   staging for a recipe saved from production. The default.
 * - home: a new tab, connected to the database the recipe was saved from.
 *   Without such a connection (recipeHome), the same as here.
 */
export type RecipeTarget = 'here' | 'home';

/**
 * Puts a recipe's query in a tab, as `target` says. Nothing runs.
 *
 * Returns the id of the tab it went into. Throws when the connection fails.
 */
// Not named use…: React's lint rule would take a use… function for a hook.
export async function openRecipe(global: GlobalStore, r: Recipe, target: RecipeTarget = 'here'): Promise<string | null> {
  const home = target === 'home' ? recipeHome(global, r) : undefined;
  if (!home) return insertRecipe(global, r);
  runInAction(() => global.addTab());
  // The new tab, taken now: switching tabs while it connects mustn't put
  // the recipe into another tab, on another database.
  const tabId = global.activeSessionId;
  // Connected first, so the query builds against its own database.
  await global.connectToSavedProfile(home.id);
  if (global.sessions[tabId]?.connectionId !== home.id) return null;
  runInAction(() => (global.activeSessionId = tabId));
  return insertRecipe(global, r);
}
