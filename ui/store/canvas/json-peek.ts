// A peek at a JSON column while a key inside it is typed, in a canvas
// picker or after Tab in the Pine panel: the first value the query finds,
// shown in the results pane under the query that fetched it. Keys inside
// JSON aren't in the schema, so seeing one value is how to know which keys
// there are.
//
// The peek has its own query and result. The tab's own expression, rows and
// columns stay as they are: the canvas is drawn from them, and changing them
// would close the picker.

import { parseJsonCellValue } from '../../components/json-cell.util';
import { findActiveBlock, isValuesBlock, splitExpressions } from '../blocks';

/** What the results pane shows while a peek is open. */
export type JsonPeek = {
  /** The node whose JSON column is peeked at. */
  alias: string;
  table: string;
  column: string;
  /** The query that fetched the value, shown above it. */
  expression: string;
  status: 'loading' | 'found' | 'empty' | 'error';
  /** The first value, parsed when it is JSON text. */
  value?: unknown;
  error?: string;
};

/**
 * The peek's query, from a select probe (`… | s:`): the query up to the
 * node's stage, focused on the node with `from:`, then the first row where
 * the column has a value. Without `is not null`, the first row is often
 * one without a value, which says nothing about the keys.
 *
 * With no alias, `column` is the name of an `unnest:`'s elements, `e`,
 * which is read by that name alone.
 */
export const peekExpression = (selectProbe: string, alias: string | null, column: string): string => {
  const base = selectProbe.replace(/\|\s*(s|select):\s*$/i, '').trimEnd();
  const target = alias ? `${alias}.${column}` : column;
  return `${base} | w: ${target} is not null | s: ${target} | l: 1`;
};

/**
 * The column's value in the first row of an eval result (headers first).
 * The result also holds columns Pine adds for itself, named `__…`, so the
 * value is found by its header.
 */
export const peekValue = (result: unknown[][] | undefined, column: string): { found: boolean; value?: unknown } => {
  const [headers, first] = result ?? [];
  if (!headers || !first) return { found: false };
  let index = headers.findIndex(h => h === column);
  if (index < 0) index = headers.findIndex(h => typeof h === 'string' && !h.startsWith('__'));
  if (index < 0) return { found: false };
  const raw = first[index];
  if (raw === null || raw === undefined) return { found: false };
  const parsed = parseJsonCellValue(raw);
  return { found: true, value: parsed === undefined ? raw : parsed };
};

/**
 * How a peek at the elements of an `unnest:` is labelled: the array they
 * come from, `dp.companies[*]`, as a join would write every element. The
 * elements of elements start at the outer ones: `o.items[*]`.
 */
export const elementLabel = (
  unnest: { table: string; text: string },
  elements: string[],
): Pick<JsonPeek, 'table' | 'column'> => ({
  table: elements.includes(unnest.text.split('.')[0]) ? '' : unnest.table,
  column: `${unnest.text}[*]`,
});

/** What a peek shows once its query has run: the value, or why there is none. */
export const peekOutcome = (
  response: { result?: unknown[][]; error?: string },
  column: string,
): Pick<JsonPeek, 'status' | 'value' | 'error'> => {
  if (response.error) return { status: 'error', error: response.error };
  const { found, value } = peekValue(response.result, column);
  return { status: found ? 'found' : 'empty', value };
};

/** The JSON column a key is being typed in, in the Pine panel: see panelPeekTarget. */
export type PanelPeekTarget = {
  /** The blocks the server needs with this one: earlier blocks, and values blocks. */
  context: string[];
  /** The block's text before the operation being typed. */
  prefix: string;
  /** Who the column might be, first guess first: `dp.content.` is column `content` of `dp`, or column `dp`. */
  candidates: { alias?: string; column: string }[];
};

// The operations a key inside a JSON column can be typed in.
const PEEK_OPERATION_RE = /^\s*(select|s|where|w|order|o|group|g|unnest)\s*:/i;
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * The JSON column a key may be being typed in, from the Pine panel's text
 * and the cursor's offset in it: `… | s: content.` or `… | w: dp.content.ad`.
 * Null unless the cursor is right after a dotted name, inside one of the
 * operations above, and there is a query before that operation. Whether the
 * column is JSON is for the server to say (see Session.peekAt).
 */
export const panelPeekTarget = (text: string, offset: number): PanelPeekTarget | null => {
  const blocks = splitExpressions(text);
  const line = text.slice(0, offset).split('\n').length - 1;
  const active = findActiveBlock(blocks, line);
  const block = blocks[active];
  if (!block || isValuesBlock(block.text)) return null;
  const blockStart = text.split('\n').slice(0, block.startLine).join('\n').length + (block.startLine ? 1 : 0);
  const before = text.slice(blockStart, offset);
  const pipe = before.lastIndexOf('|');
  if (pipe < 0) return null;
  const prefix = before.slice(0, pipe).trimEnd();
  const clause = before.slice(pipe + 1);
  if (!prefix || !PEEK_OPERATION_RE.test(clause)) return null;
  const token = clause.match(/[A-Za-z0-9_.'[\]-]*$/)?.[0] ?? '';
  const raw = token.split('.');
  const parts = raw.map(p => p.replace(/(\[\d+\])+$/, ''));
  if (parts.length < 2 || !NAME_RE.test(parts[0])) return null;
  const candidates: PanelPeekTarget['candidates'] = [];
  // `data[1].tags.` can't start with an alias: an alias has no index.
  if (parts.length >= 3 && NAME_RE.test(raw[0]) && NAME_RE.test(parts[1])) {
    candidates.push({ alias: parts[0], column: parts[1] });
  }
  candidates.push({ column: parts[0] });
  const context = [
    ...blocks.slice(0, active).map(b => b.text),
    ...blocks.slice(active + 1).filter(b => isValuesBlock(b.text)).map(b => b.text),
  ];
  return { context, prefix, candidates };
};
