import type { Ast } from './client';
import { getColorByTableIndex } from './graph.util';
import type { Session } from './session';

/**
 * Single source of truth for when to show table colors (Pine segments + result columns).
 * Colors are shown only when: pref on, we have results, and current input matches last eval.
 */
export function shouldShowTableColors(pineTableColorsEnabled: boolean, session: Session): boolean {
  if (!pineTableColorsEnabled || session.rows.length === 0) return false;
  const currentInput = session.inputMode === 'sql' ? session.query : session.expression;
  return currentInput.trim() === session.expressionAtLastEval.trim();
}

/**
 * Alias → table index from AST selected-tables order. Used so grid and Pine editor share the same color mapping.
 */
function getAliasToTableIndex(ast: Ast | null): Map<string, number> {
  const ordered = ast?.['selected-tables']?.map(t => t.alias) ?? [];
  return new Map(ordered.map((a, i) => [a, i]));
}

/** Color for a result-column alias (same palette and order as Pine segment colors). */
export function getColorForAlias(alias: string, ast: Ast | null, isDark: boolean): string {
  const index = getAliasToTableIndex(ast).get(alias) ?? 0;
  return getColorByTableIndex(index, isDark);
}
