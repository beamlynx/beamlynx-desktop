import {
  autocompletion,
  Completion,
  CompletionContext,
  CompletionResult,
  selectedCompletion,
} from '@codemirror/autocomplete';
import { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Hints, TableHint } from '../store/client';

// Configuration constants
const MAX_AUTOCOMPLETE_OPTIONS = 15;

// Extended completion interface for Pine-specific completions
interface PineCompletion extends Completion {
  expression?: string;
}

interface PineCompletionContext {
  hints: Hints | null;
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

  // Add table hints (preserving original order)
  if (hints?.table) {
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

  }

  if (completions.length === 0) {
    completions.push({
      expression: '',
      label: '',
      detail: 'Nothing found',
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
      optionClass: () => 'pine-autocomplete-option',
      aboveCursor: false,
      icons: false,
    }),
    createAutocompleteListener(callbacks),
  ];
}
