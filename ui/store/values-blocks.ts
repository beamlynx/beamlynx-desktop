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
 *
 * `string` keeps every value quoted, for a variable whose value is already a
 * string: `'007'` must not come back as the number 7, nor `'true'` as a
 * boolean.
 */
export function literalFor(text: string, list: boolean, opts: { string?: boolean } = {}): string {
  const one = (v: string) => {
    const t = v.trim();
    if (!opts.string && (NUMBER.test(t) || t === 'true' || t === 'false')) return t;
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

/** Whether a value from pine-lang's report is a string, or a list of them. */
export const isStringValue = (value: unknown): boolean =>
  typeof value === 'string' || (Array.isArray(value) && value.some(v => typeof v === 'string'));

/** Where a `/* ... *\/` comment, a `-- ...` comment or whitespace ends. */
function skipSpace(text: string, i: number, newlines: boolean): number {
  for (;;) {
    if (text.startsWith('/*', i)) {
      const close = text.indexOf('*/', i + 2);
      i = close === -1 ? text.length : close + 2;
    } else if (newlines && text.startsWith('--', i)) {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? text.length : nl;
    } else if (i < text.length && (newlines ? /\s/ : /[ \t]/).test(text[i])) {
      i++;
    } else {
      return i;
    }
  }
}

/** Where the value starting at `i` ends: a string, a bracketed list or a word. */
function valueEnd(text: string, i: number): number {
  if (text[i] === "'") {
    const close = text.indexOf("'", i + 1);
    return close === -1 ? text.length : close + 1;
  }
  if (text[i] === '(') {
    let j = i + 1;
    while (j < text.length && text[j] !== ')') {
      if (text[j] === "'") {
        const close = text.indexOf("'", j + 1);
        j = close === -1 ? text.length : close + 1;
      } else {
        j++;
      }
    }
    return Math.min(j + 1, text.length);
  }
  let j = i;
  while (j < text.length && !/[\s,)]/.test(text[j]) && !text.startsWith('--', j) && !text.startsWith('/*', j)) j++;
  return j;
}

/**
 * Every `$name = value` in the tab's values blocks (every name when `name`
 * is null), as offsets into the text: where the `$` is, and where the
 * value starts and ends. A value that's missing (`$x =` at
 * the end of a line) is an empty span. Query blocks and comments are never
 * read, so a `$x =` there is never rewritten.
 */
function assignments(
  expression: string,
  name: string | null,
): { name: string; at: number; start: number; end: number }[] {
  const lineStarts = [0];
  for (let i = 0; i < expression.length; i++) if (expression[i] === '\n') lineStarts.push(i + 1);
  const found: { name: string; at: number; start: number; end: number }[] = [];
  for (const block of splitExpressions(expression)) {
    if (!isValuesBlock(block.text)) continue;
    const from = expression.indexOf(block.text, lineStarts[block.startLine]);
    const to = from + block.text.length;
    let i = from;
    while (i < to) {
      i = skipSpace(expression, i, true);
      if (i >= to) break;
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/.exec(expression.slice(i, to));
      if (!m) {
        // Not an assignment: a stray token. Move past it so the scan ends.
        i = valueEnd(expression, i) || i + 1;
        if (expression[i] === ',' || expression[i] === ')') i++;
        continue;
      }
      const start = skipSpace(expression, i + m[0].length, false);
      const atEndOfLine = start >= to || expression[start] === '\n' || expression.startsWith('--', start);
      const end = atEndOfLine ? start : valueEnd(expression, start);
      if (name === null || m[1] === name) found.push({ name: m[1], at: i, start, end });
      i = Math.max(end, i + m[0].length);
    }
  }
  return found;
}

/**
 * The tab with `$name` set to `literal`. The last `$name = ...` in a values
 * block is rewritten, because the last one is what pine-lang uses. Only the
 * value changes: a comment after it stays. With no such line, one is added
 * to the last values block above the query, or a new values block goes at
 * the top. Built by slicing, so a `$` in the value is written as is.
 */
export function setValue(expression: string, name: string, literal: string): string {
  const last = assignments(expression, name).pop();
  if (last) {
    const before = expression.slice(0, last.start);
    const gap = last.start === last.end && !/[ \t]$/.test(before) ? ' ' : '';
    return before + gap + literal + expression.slice(last.end);
  }
  const assignment = `$${name} = ${literal}`;
  const parts = splitQuery(expression);
  if (parts && parts.prefix) {
    return joinQuery(`${parts.prefix.replace(/\s*$/, '')}\n${assignment}\n\n`, parts.query);
  }
  return expression.trim() ? `${assignment}\n\n${expression}` : `${assignment}\n`;
}

/** A value from JSON as a Pine literal, or null when Pine can't write it. */
function literalOfValue(value: unknown): string | null {
  const one = (v: unknown): string | null =>
    typeof v === 'number' || typeof v === 'boolean'
      ? String(v)
      : typeof v === 'string' && !v.includes("'")
        ? `'${v}'`
        : null;
  if (!Array.isArray(value)) return one(value);
  const items = value.map(one);
  return items.length && items.every(i => i !== null) ? `(${items.join(', ')})` : null;
}

/**
 * The agent's tab after a run, with the values the run used written back.
 * The tab shows pine-lang's prettified query, which has no values blocks, so
 * without this the person sees `$name` with no value and can't run it again.
 * The values blocks the agent wrote come back first, then each value it
 * passed in `variables` is set on top, as those won. A value Pine can't
 * write (a string with a quote) is left out; it still ran.
 */
export function restoreValues(shown: string, sent: string, variables: Record<string, unknown>): string {
  let text = shown;
  if (!splitExpressions(text).some(b => isValuesBlock(b.text))) {
    const written = splitExpressions(sent).filter(b => isValuesBlock(b.text)).map(b => b.text);
    if (written.length && text.trim()) text = `${written.join('\n\n')}\n\n${text}`;
  }
  for (const [name, value] of Object.entries(variables)) {
    const literal = literalOfValue(value);
    if (literal !== null) text = setValue(text, name, literal);
  }
  return text;
}

/** Every `$name` the tab's values blocks set. */
export const valueNames = (expression: string): Set<string> =>
  new Set(assignments(expression, null).map(a => a.name));

/**
 * The text without its `$name = value` assignments for these names. A line
 * that held only the assignment (and maybe a comment after it) goes
 * entirely.
 */
export function withoutValues(expression: string, names: Set<string>): string {
  let text = expression;
  for (const a of assignments(expression, null).reverse()) {
    if (!names.has(a.name)) continue;
    const lineStart = text.lastIndexOf('\n', a.at - 1) + 1;
    const nl = text.indexOf('\n', a.end);
    const lineEnd = nl === -1 ? text.length : nl;
    const alone = !text.slice(lineStart, a.at).trim() && /^\s*(--.*)?$/.test(text.slice(a.end, lineEnd));
    text = alone
      ? text.slice(0, lineStart) + text.slice(nl === -1 ? lineEnd : lineEnd + 1)
      : text.slice(0, a.at) + text.slice(a.end);
  }
  return text;
}
