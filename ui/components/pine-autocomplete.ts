import {
  autocompletion,
  CompletionContext,
  CompletionResult,
  Completion,
  completionStatus,
  selectedCompletion,
} from '@codemirror/autocomplete';
import { Extension } from '@codemirror/state';
import { ViewPlugin, ViewUpdate } from '@codemirror/view';
import { TableHint, ColumnHint, Hints } from '../store/client';

// Configuration constants
const MAX_AUTOCOMPLETE_OPTIONS = 15;

interface PineCompletionContext {
  hints: Hints | null;
  expression: string;
}

// Callback interface for autocomplete highlight events
interface AutocompleteHighlightCallback {
  onHighlight?: (completion: Completion | null) => void;
}

// Pine operators and keywords
const PINE_OPERATORS = [
  { label: ' select: ', detail: 'Select columns', type: 'keyword' },
  { label: ' where:  ', detail: 'Where', type: 'keyword' },
  { label: ' limit:  ', detail: 'Limit', type: 'keyword' },
  { label: ' from:   ', detail: 'Set the context for the next operation', type: 'keyword' },
  { label: ' order:  ', detail: 'Order', type: 'keyword' },
  { label: ' group:  ', detail: 'Group', type: 'keyword' },
  { label: ' delete! ', detail: 'Delete', type: 'keyword' },
  { label: ' count:  ', detail: 'Count', type: 'keyword' },
];

// Helper function to extract a meaningful label from a TableHint
function getPineCompletions(
  context: CompletionContext,
  pineContext: PineCompletionContext,
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

  const completions: Completion[] = [];

  // Check if cursor is immediately after a pipe and space
  const afterPipeSpace = beforeCursor.trim().endsWith('|');

  // Add Pine operators/keywords (with high boost to ensure they appear first)
  PINE_OPERATORS.forEach(op => {
    if ((word !== '' && op.label.toLowerCase().includes(word.toLowerCase())) || (word === '' && afterPipeSpace)) {
      completions.push({
        label: op.label,
        detail: op.detail,
        type: op.type,
        apply: op.label,
        boost: 100, // High boost to ensure operators appear first
      });
    }
  });

  // Add table hints (preserving original order)
  if (hints?.table) {
    const getKey = (hint: TableHint) => `${hint.schema}.${hint.table}`;
    const tableCount = hints?.table?.reduce((acc, hint) => {
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
          label: hint.table,
          detail: (tableCount.get(getKey(hint)) || 0) > 1 ? hint.pine : undefined,
          type: 'variable',
          apply: hint.pine,
          boost: maxTableBoost - index, // Decreasing boost to maintain original order
        });
      }
    });
  }

  if (completions.length === 0) {
    return null;
  }

  // Sort completions by boost only (preserving original order within same boost level)
  const sortedCompletions = completions.sort((a, b) => {
    if (a.boost === undefined || b.boost === undefined) { return 0; }
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
function createAutocompleteListener(callbacks?: AutocompleteHighlightCallback): Extension {
  return ViewPlugin.fromClass(class {
    private lastSelectedCompletion: Completion | null = null;
    
    constructor(view: any) {
      // Initial check
      this.checkSelectionChange(view);
    }
    
    update(update: ViewUpdate) {
      this.checkSelectionChange(update.view);
    }
    
    private checkSelectionChange(view: any) {
      // Get the currently selected completion
      const selected = selectedCompletion(view.state);
      
      // Check if the selection has changed
      if (selected !== this.lastSelectedCompletion) {
        this.lastSelectedCompletion = selected;
        
        // Call the onHighlight callback
        if (callbacks?.onHighlight) {
          callbacks.onHighlight(selected);
        }
      }
    }
  });
}

export function createPineAutocompletion(
  pineContext: PineCompletionContext, 
  callbacks: AutocompleteHighlightCallback
): Extension {
  return [
    autocompletion({
      override: [
        (context: CompletionContext) => {
          return getPineCompletions(context, pineContext);
        },
      ],
      closeOnBlur: true,
      activateOnTyping: true,
      selectOnOpen: true,
      maxRenderedOptions: MAX_AUTOCOMPLETE_OPTIONS,
      defaultKeymap: true,
      tooltipClass: () => 'pine-autocomplete-tooltip',
      optionClass: () => 'pine-autocomplete-option',
      aboveCursor: false,
      icons: false,
    }),
    createAutocompleteListener(callbacks)
  ];
}
