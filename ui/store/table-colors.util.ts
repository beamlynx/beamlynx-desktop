import type { Ast } from './client';
import { getColorByTableIndex } from './graph.util';
import type { Session } from './session';

/**
 * Single source of truth for when to show table colors (Pine segments + result columns).
 * Colors are shown only when: pref on, we have results, and current input matches last eval.
 *
 * `canvasActive` (New Layout, or Legacy's own Canvas mode - see
 * GlobalStore.canvasActive) always compares against `session.expression`,
 * regardless of `session.inputMode` - the SQL panel there is just a *view*
 * onto canvas's own output, kept in sync by the build reaction, not an
 * independent source of truth the way hand-typed SQL is outside canvas mode.
 * Without this, merely opening the SQL panel (Ctrl/Cmd+,) to peek at the
 * generated SQL flips `currentInput` to `session.query` mid-comparison
 * against an `expressionAtLastEval` still holding Pine text from before the
 * panel opened - an instant, spurious mismatch that hides colors on a result
 * set that never actually went stale.
 */
export function shouldShowTableColors(pineTableColorsEnabled: boolean, session: Session, canvasActive: boolean): boolean {
  if (!pineTableColorsEnabled || session.rows.length === 0) return false;
  const currentInput = !canvasActive && session.inputMode === 'sql' ? session.query : session.expression;
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
