import type { GlobalStore } from '../../store/global.store';
import { recipeText, textToInsert, type Recipe } from '../../utils/recipes';

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
