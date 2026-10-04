// Values blocks: a block of only `$name = value` lines, which sets values for
// the tab's $variables (pine-lang's docs/variables.md). pine-lang reads them;
// this is what the app needs to know about them as text:
//
//   - which blocks are values blocks (never the block a build or the canvas
//     works on),
//   - the tab split into its values blocks and its one query block, for the
//     canvas, which only ever edits the query,
//   - setting a value by editing the text, for the canvas's Variables list.
import { isValuesBlock, splitExpressions } from './blocks';

export { isValuesBlock };

/**
 * The tab as the canvas sees it: values blocks above, then one query block.
 * `prefix` is the text before the query, ending in a blank line when there
 * is any, so `prefix + query` is the tab. Null when the tab isn't that shape:
 * more than one query block, or a values block after the query.
 */
export function splitQuery(expression: string): { prefix: string; query: string } | null {
  const blocks = splitExpressions(expression);
  const queries = blocks.filter(b => !isValuesBlock(b.text));
  if (queries.length > 1) return null;
  if (queries.length === 0) {
    const prefix = expression.replace(/\s*$/, '');
    return { prefix: prefix ? `${prefix}\n\n` : '', query: '' };
  }
  const query = queries[0];
  if (blocks[blocks.length - 1] !== query) return null;
  const before = expression.split('\n').slice(0, query.startLine).join('\n').replace(/\s*$/, '');
  return { prefix: before ? `${before}\n\n` : '', query: query.text };
}

/** The query block back with its values blocks in front. */
export const joinQuery = (prefix: string, query: string): string => prefix + query;

const NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * A value as typed in the canvas, written as a Pine literal: a number or
 * true/false as is, anything else quoted. A list (for a variable used with
 * `in`) is typed comma-separated and written in brackets. Pine strings can't
 * contain a quote, so one is refused.
 */
export function literalFor(text: string, list: boolean): string {
  const one = (v: string) => {
    const t = v.trim();
    if (NUMBER.test(t) || t === 'true' || t === 'false') return t;
    if (t.includes("'")) throw new Error("A value can't contain a single quote (').");
    return `'${t}'`;
  };
  if (list) {
    const items = text.split(',').map(v => v.trim()).filter(Boolean);
    if (!items.length) throw new Error('Type at least one value, comma-separated.');
    return `(${items.map(one).join(', ')})`;
  }
  if (!text.trim()) throw new Error('Type a value.');
  return one(text);
}

/** How a value from pine-lang's report reads back in the canvas's field. */
export const displayValue = (value: unknown): string =>
  Array.isArray(value) ? value.join(', ') : value === undefined || value === null ? '' : String(value);

/**
 * The tab with `$name` set to `literal`: the existing `$name = ...` line
 * rewritten in place when there is one, otherwise a new line added to the
 * last values block above the query, or a new values block at the top.
 */
export function setValue(expression: string, name: string, literal: string): string {
  const line = new RegExp(`^(\\s*\\$${name}\\s*=\\s*).*$`, 'm');
  if (line.test(expression)) return expression.replace(line, `$1${literal}`);
  const assignment = `$${name} = ${literal}`;
  const parts = splitQuery(expression);
  if (parts && parts.prefix) {
    return joinQuery(`${parts.prefix.replace(/\s*$/, '')}\n${assignment}\n\n`, parts.query);
  }
  return expression.trim() ? `${assignment}\n\n${expression}` : `${assignment}\n`;
}
