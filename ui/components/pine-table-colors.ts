import * as View from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import { Ast, Table } from '../store/client';
import { getColorByTableIndex } from '../store/graph.util';

/** Dispatch this effect when ast changes so segment decorations are recomputed */
export const astChangedEffect = StateEffect.define<void>();

/** Operation prefixes that indicate a non-table segment (select, where, from, etc.) */
const OPERATION_PREFIXES =
  /^\s*(s|select|w|where|f|from|o|order|l|limit|g|group|count|d|delete|u|update)[:!]/i;

function isTableSegment(trimmed: string): boolean {
  return trimmed.length > 0 && !OPERATION_PREFIXES.test(trimmed);
}

/**
 * Find segment ranges in the expression (parts separated by |) and assign each to a table index
 * based on the AST's selected-tables order. Only valid when we have a successful AST (e.g. after run).
 * Uses table index so each table gets a distinct color (no hash collisions).
 */
export function getSegmentRanges(
  expression: string,
  selectedTables: Table[],
): { from: number; to: number; tableIndex: number }[] {
  if (!expression.trim() || selectedTables.length === 0) return [];

  const ranges: { from: number; to: number; tableIndex: number }[] = [];
  let i = 0;
  let tableIndex = 0;

  while (i < expression.length) {
    // Skip whitespace and pipes before this segment
    while (i < expression.length && /[\s|]/.test(expression[i])) i++;
    if (i >= expression.length) break;

    const from = i;
    while (i < expression.length && expression[i] !== '|') i++;
    const to = i;
    const segment = expression.slice(from, to).trim();

    if (segment && tableIndex < selectedTables.length) {
      if (isTableSegment(segment)) tableIndex++;
      ranges.push({ from, to, tableIndex: tableIndex - 1 });
    }
  }

  return ranges;
}

function buildDecorations(expression: string, ast: Ast, isDark: boolean): DecorationSet {
  if (!ast['selected-tables']?.length) return View.Decoration.none;
  const ranges = getSegmentRanges(expression, ast['selected-tables']);
  const decos = ranges.map(({ from, to, tableIndex }) =>
    View.Decoration.mark({
      attributes: {
        style: `background-color: ${getColorByTableIndex(tableIndex, isDark)}; border-radius: 2px;`,
      },
    }).range(from, to),
  );
  return View.Decoration.set(decos);
}

/**
 * CodeMirror extension that decorates Pine expression segments with background colors
 * by table alias (same colors as the result grid). Only applies when ast is present (e.g. after run).
 * Dispatch astChangedEffect when ast changes from outside (e.g. after Run) to recompute.
 */
export function pineTableColorDecoration(ast: Ast | null, isDark: boolean) {
  const tableColorField = StateField.define<DecorationSet>({
    create(state) {
      if (!ast) return View.Decoration.none;
      return buildDecorations(state.doc.toString(), ast, isDark);
    },
    update(decorations, tr) {
      const astFromClosure = ast;
      const shouldRebuild = tr.docChanged || tr.effects.some(e => e.is(astChangedEffect));
      if (!shouldRebuild) return decorations;
      if (!astFromClosure) return View.Decoration.none;
      return buildDecorations(tr.state.doc.toString(), astFromClosure, isDark);
    },
  });
  return [tableColorField, View.EditorView.decorations.from(tableColorField)];
}
