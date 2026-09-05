import {
  autocompletion,
  Completion,
  CompletionContext,
  CompletionResult,
  selectedCompletion,
} from '@codemirror/autocomplete';
import { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Hints, PathHint, TableHint } from '../store/client';

// Configuration constants
const MAX_AUTOCOMPLETE_OPTIONS = 15;

// Extended completion interface for Pine-specific completions
interface PineCompletion extends Completion {
  expression?: string;
}

interface PineCompletionContext {
  hints: Hints | null;
  // A live getter rather than a snapshot value: reading it fresh on every
  // completion query reflects the current build status without needing the
  // (memoized, teardown-on-change) autocompletion extension to be rebuilt
  // whenever loading starts/stops.
  isLoading: () => boolean;
}

// Callback interface for autocomplete highlight events
interface AutocompleteCallbacks {
  onHighlight?: (completion: PineCompletion | null) => void;
  onPipe?: (view: EditorView) => void;
}

// Helper function to extract a meaningful label from a TableHint
function getPineCompletions(
  context: CompletionContext,
  pineContext: PineCompletionContext,
  callbacks?: AutocompleteCallbacks,
): CompletionResult | null {
  const { hints } = pineContext;
  const { pos } = context;
  const line = context.state.doc.lineAt(pos);
  const lineText = line.text;
  const beforeCursor = lineText.slice(0, pos - line.from);
  const afterCursor = lineText.slice(pos - line.from);

  // Find the word being typed
  const wordMatch = beforeCursor.match(/(\.|[A-Za-z0-9_-]*)$/);
  const word = wordMatch ? wordMatch[1] : '';
  const wordStart = pos - word.length;

  const completions: PineCompletion[] = [];

  // Check if cursor is immediately after a pipe and space
  const afterPipeSpace = beforeCursor.trim().endsWith('|');

  // Is the operation currently being typed a `? table` path search
  // (pine-lang docs/paths.md), rather than a normal table/join? Unlike every
  // other operation, its segment starts with a literal `?`, which the `word`
  // regex above never captures (it's not a word character) - `wordStart`
  // alone can only ever point at the partial table name after it, never at
  // the `?` itself. Look at the text since the last top-level pipe instead.
  const clauseStart = beforeCursor.lastIndexOf('|') + 1;
  const clause = beforeCursor.slice(clauseStart);
  const inPathsContext = clause.trimStart().startsWith('?');
  // Absolute doc position of the `?` itself - a chosen route needs to
  // replace the WHOLE `? partial-target` fragment, not just the partial
  // word after it, or the `?` is left dangling in the text.
  const qPos = inPathsContext ? line.from + clauseStart + clause.indexOf('?') : -1;

  if (inPathsContext) {
    // Once the typed target names a real table, pine-lang's search has
    // already run (ast.hints.paths) - offer the discovered routes
    // themselves, replacing the entire `? target` fragment (from qPos, not
    // wordStart) with the full (possibly multi-hop) route text.
    if (hints?.paths?.length) {
      hints.paths.forEach((path: PathHint, index) => {
        const lastHop = path.hops[path.hops.length - 1];
        completions.push({
          expression: path.pine,
          section: 'Paths',
          label: lastHop.table,
          // Only set when this destination is reachable more than one way -
          // same role as a join hint's own `info` (line ~78 below), just
          // naming the stops along the route instead of a disambiguating FK
          // column.
          detail:
            path.length > 1
              ? `via ${path.hops
                  .slice(0, -1)
                  .map(h => h.table)
                  .join(', ')}`
              : undefined,
          type: 'variable',
          apply: (view: EditorView) => {
            view.dispatch({
              changes: { from: qPos, to: pos, insert: path.pine + '|' },
              selection: { anchor: qPos + path.pine.length + 1 },
            });
            if (callbacks?.onPipe) {
              callbacks.onPipe(view);
            }
          },
          boost: hints.paths.length - index,
        });
      });
    } else {
      // Still naming the destination - offer bare table names (reachability-
      // filtered server-side, see pine-lang's generate-path-hints), not a
      // whole new operation: no schema prefix, no trailing pipe, since this
      // only completes `?`'s own target, not a table op of its own.
      hints?.table?.forEach((hint, index) => {
        if (hint.table.toLowerCase().includes(word.toLowerCase()) || word === '') {
          completions.push({
            expression: hint.table,
            section: 'Tables',
            label: hint.table,
            type: 'variable',
            apply: hint.table,
            boost: (hints.table?.length ?? 0) - index,
          });
        }
      });
    }
  } else if (hints?.table) {
    const getKey = (hint: TableHint) => `${hint.schema}.${hint.table}`;
    const tableCount =
      hints?.table?.reduce((acc, hint) => {
        const key = getKey(hint);
        const count = acc.get(key) || 0;
        acc.set(key, count + 1);
        return acc;
      }, new Map<string, number>()) || new Map<string, number>();

    // Use a boost range that accommodates all hints
    const maxTableBoost = Math.max(hints.table.length, MAX_AUTOCOMPLETE_OPTIONS);

    hints.table.forEach((hint, index) => {
      if (hint.table.toLowerCase().includes(word.toLowerCase()) || word === '') {
        completions.push({
          expression: hint.pine,
          section: 'Tables',
          label: hint.table,
          info: (tableCount.get(getKey(hint)) || 0) > 1 ? hint.pine : undefined,
          type: 'variable',
          apply: (view: EditorView, completion: PineCompletion, from: number, to: number) => {
            // Insert pipe
            view.dispatch({
              changes: { from, to, insert: hint.pine + '|' },
              selection: { anchor: from + hint.pine.length + 1 },
            });
            if (callbacks?.onPipe) {
              callbacks.onPipe(view);
            }
          },
          boost: maxTableBoost - index, // Decreasing boost to maintain original order
        });
      }
    });

    hints.select.forEach((hint, index) => {
      if (hint.column.toLowerCase().includes(word.toLowerCase()) || word === '') {
        completions.push({
          expression: hint.column,
          section: 'Columns',
          label: hint.column,
          apply: `${hint.column}, `,
        });
      }
    });

    hints.order.forEach((hint, index) => {
      if (hint.column.toLowerCase().includes(word.toLowerCase()) || word === '') {
        completions.push({
          expression: hint.column,
          section: 'Columns',
          label: hint.column,
          apply: `${hint.column} desc, `,
        });
      }
    });

    hints.where.forEach((hint, index) => {
      if (hint.column.toLowerCase().includes(word.toLowerCase()) || word === '') {
        completions.push({
          expression: hint.column,
          section: 'Columns',
          label: hint.column,
          apply: `${hint.column} = `,
        });
      }
    });

    hints.update?.forEach((hint, index) => {
      if (hint.column.toLowerCase().includes(word.toLowerCase()) || word === '') {
        completions.push({
          expression: hint.column,
          section: 'Columns',
          label: hint.column,
          apply: `${hint.column} = `,
        });
      }
    });

  }

  if (completions.length === 0) {
    const loading = pineContext.isLoading();
    completions.push({
      expression: '',
      label: '',
      detail: loading ? 'Loading...' : 'Nothing found',
      // Marks this as a non-candidate placeholder so optionClass (below) can
      // style it distinctly instead of inheriting the selected-candidate look.
      type: loading ? 'pine-loading' : 'pine-empty',
      apply: () => {},
      boost: 100,
    });
  }
  // Sort completions by boost only (preserving original order within same boost level)
  const sortedCompletions = completions.sort((a, b) => {
    if (a.boost === undefined || b.boost === undefined) {
      return 0;
    }
    return b.boost - a.boost;
  });

  return {
    from: wordStart,
    options: sortedCompletions,
    // Disable CodeMirror's internal filtering by providing empty filter
    filter: false,
  };
}

// ViewPlugin to detect autocomplete selection changes
function createAutocompleteListener(callbacks?: AutocompleteCallbacks): Extension {
  return ViewPlugin.fromClass(
    class {
      private lastSelectedCompletion: PineCompletion | null = null;

      constructor(view: any) {
        // Initial check
        this.checkSelectionChange(view);
      }

      update(update: ViewUpdate) {
        this.checkSelectionChange(update.view);
      }

      private checkSelectionChange(view: any) {
        // Get the currently selected completion
        const selected = selectedCompletion(view.state) as PineCompletion | null;

        // Check if the selection has changed (compare by expression to handle same table names with different pine expressions)
        if (selected?.expression !== this.lastSelectedCompletion?.expression) {
          this.lastSelectedCompletion = selected;

          // Call the onHighlight callback
          if (callbacks?.onHighlight) {
            callbacks.onHighlight(selected);
          }
        }
      }
    },
  );
}

export function createPineAutocompletion(
  pineContext: PineCompletionContext,
  callbacks: AutocompleteCallbacks,
): Extension {
  return [
    autocompletion({
      override: [
        (context: CompletionContext) => {
          return getPineCompletions(context, pineContext, callbacks);
        },
      ],
      closeOnBlur: true,
      activateOnTyping: false,
      selectOnOpen: true,
      maxRenderedOptions: MAX_AUTOCOMPLETE_OPTIONS,
      defaultKeymap: true,
      tooltipClass: () => 'pine-autocomplete-tooltip',
      optionClass: (completion: Completion) => {
        if (completion.type === 'pine-loading')
          return 'pine-autocomplete-option pine-autocomplete-loading';
        if (completion.type === 'pine-empty')
          return 'pine-autocomplete-option pine-autocomplete-empty';
        return 'pine-autocomplete-option';
      },
      aboveCursor: false,
      icons: false,
    }),
    createAutocompleteListener(callbacks),
  ];
}
