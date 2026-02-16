import * as View from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { StateField } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import type { Ast, PineRange } from '../store/client';
import { getColorByTableIndex } from '../store/graph.util';

/**
 * Convert a server-side PineRange (line/character) to an absolute document
 * offset pair that CodeMirror can use for decorations.
 */
function toAbsoluteRange(
  state: EditorState,
  range: PineRange,
): { from: number; to: number } | null {
  const startLine = range.start.line + 1; // CodeMirror lines are 1-indexed
  const endLine = range.end.line + 1;

  if (startLine > state.doc.lines || endLine > state.doc.lines) return null;

  const from = state.doc.line(startLine).from + range.start.character;
  const to = state.doc.line(endLine).from + range.end.character;

  if (from >= to || to > state.doc.length) return null;
  return { from, to };
}

function buildDecorations(state: EditorState, ast: Ast, isDark: boolean): DecorationSet {
  const ranges = ast.ranges ?? [];
  if (!ranges.length) return View.Decoration.none;

  const tableOrder = new Map(
    (ast['selected-tables'] ?? []).map((t, i) => [t.alias, i]),
  );

  const decos = ranges
    .map(range => {
      const abs = toAbsoluteRange(state, range);
      if (!abs) return null;
      return View.Decoration.mark({
        attributes: {
          style: `background-color: ${getColorByTableIndex(tableOrder.get(range.alias) ?? 0, isDark)}; border-radius: 2px;`,
        },
      }).range(abs.from, abs.to);
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  if (!decos.length) return View.Decoration.none;

  decos.sort((a, b) => a.from - b.from);
  return View.Decoration.set(decos);
}

/**
 * CodeMirror extension that decorates expression segments with background colors
 * based on the AST's ranges and table ordering (same colors as the result grid).
 *
 * Creates a fresh StateField per call — react-codemirror reconfiguration
 * calls create() with the latest closure data each time the ast changes.
 */
export function tableColorDecoration(ast: Ast | null, isDark: boolean) {
  const field = StateField.define<DecorationSet>({
    create(state) {
      if (!ast) return View.Decoration.none;
      return buildDecorations(state, ast, isDark);
    },
    update(value) {
      return value;
    },
  });
  return [field, View.EditorView.decorations.from(field)];
}
