import {
  autocompletion,
  CompletionContext,
  CompletionResult,
  Completion,
} from '@codemirror/autocomplete';
import { Extension } from '@codemirror/state';
import { TableHint, ColumnHint, Hints } from '../store/client';

interface PineCompletionContext {
  hints: Hints | null;
  expression: string;
}

// Pine operators and keywords
const PINE_OPERATORS = [
  { label: 'select: ', detail: 'Select columns', type: 'keyword' },
  { label: 'where: ', detail: 'Where', type: 'keyword' },
  { label: 'limit: ', detail: 'Limit', type: 'keyword' },
  { label: 'from: ', detail: 'Set the context for the next operation', type: 'keyword' },
  { label: 'order: ', detail: 'Order', type: 'keyword' },
  { label: 'group: ', detail: 'Group', type: 'keyword' },
  { label: 'delete! ', detail: 'Delete', type: 'keyword' },
  { label: 'count: ', detail: 'Count', type: 'keyword' },
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

  // Add Pine operators/keywords
  PINE_OPERATORS.forEach(op => {
    if (op.label.toLowerCase().includes(word.toLowerCase()) || word === '') {
      completions.push({
        label: op.label,
        detail: op.detail,
        type: op.type,
        apply: op.label,
        boost: op.label.toLowerCase().startsWith(word.toLowerCase()) ? 10 : 0,
      });
    }
  });

  // Create a map of pine expressions and their counts if hints exist


  // Add table hints
  if (hints?.table) {
  const getKey = (hint: TableHint) => `${hint.schema}.${hint.table}`;
  const tableCount = hints?.table?.reduce((acc, hint) => {
    const key = getKey(hint);
    const count = acc.get(key) || 0;
    acc.set(key, count + 1);
    return acc;
  }, new Map<string, number>()) || new Map<string, number>();

    hints.table.forEach(hint => {
      if (hint.table.toLowerCase().includes(word.toLowerCase()) || word === '') {
        completions.push({
          label: hint.table,
          detail: (tableCount.get(getKey(hint)) || 0) > 1 ? hint.pine : undefined,
          type: 'variable',
          apply: hint.pine,
          boost: tableCount.get(getKey(hint)) ? 10 : 0,
        });
      }
    });
  }

  if (completions.length === 0) {
    return null;
  }

  // Sort completions by boost (relevance) and then alphabetically
  const sortedCompletions = completions.sort((a, b) => {
    const aBoost = a.boost || 0;
    const bBoost = b.boost || 0;
    if (aBoost !== bBoost) {
      return bBoost - aBoost; // Higher boost first
    }
    return a.label.localeCompare(b.label);
  });

  return {
    from: wordStart,
    options: sortedCompletions,
  };
}

export function createPineAutocompletion(pineContext: PineCompletionContext): Extension {
  return autocompletion({
    override: [
      (context: CompletionContext) => {
        return getPineCompletions(context, pineContext);
      },
    ],
    closeOnBlur: true,
    activateOnTyping: true,
    selectOnOpen: false,
    maxRenderedOptions: 15,
    defaultKeymap: true,
    tooltipClass: () => 'pine-autocomplete-tooltip',
    optionClass: () => 'pine-autocomplete-option',
    aboveCursor: false,
    icons: false,
  });
}
