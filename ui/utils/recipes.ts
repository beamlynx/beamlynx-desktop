// Recipes: saved Pine queries with values that are filled in each time.
// Storage lives in beamlynx-desktop (window.beamlynxDesktop.recipes). This
// module is the text side, kept free of React and MobX so the tests can run
// it directly:
//
//   - which blocks of a tab Ctrl+S saves, and a title for them,
//   - which values in a query can become variables, and turning them into
//     $name (not used by the app yet: the groundwork for making any value in
//     the editor a variable).
//
// A recipe's $variables go into the tab as written; the Variables strip
// holds their values, and pine-lang binds them when the query runs.
//
// See beamlynx-plans/pending/2026-10-01-recipes-shared-database-knowledge.md.
import { leadingDoc } from '../store/canvas/pine-text';
import { findActiveQueryBlock, isValuesBlock, splitExpressions } from '../store/blocks';
import { valueNames, withoutValues } from '../store/values-blocks';

export type RecipeInputDef = {
  name: string;
  example: string;
  kind: 'string' | 'number';
  column?: string;
};

// Matches beamlynx-desktop's src/main/app-db.ts Recipe. Recipes are global:
// every recipe is offered on every database. savedFrom is where it was saved,
// such as 'postgres://localhost:5432/shop', kept as context.
export type Recipe = {
  id: string;
  savedFrom: string | null;
  title: string;
  explanation: string;
  expression: string;
  inputs: RecipeInputDef[];
  author: string;
  source: 'person' | 'agent';
  agent: string | null;
  visibility: 'private';
  createdAt: number;
  updatedAt: number;
};

export type SaveRecipeInput = {
  id?: string;
  title: string;
  explanation?: string;
  expression: string;
  inputs?: RecipeInputDef[];
};

// ---------------------------------------------------------------------------
// Masking: comments and string contents hidden, positions kept
// ---------------------------------------------------------------------------

/**
 * The same text with comments turned into spaces and the inside of every
 * string turned into `x`, quotes kept. Every position stays where it was, so
 * a match found in the masked text is a span of the original. This is what
 * keeps `name = 'a = 5'` from reading as two conditions, and a commented-out
 * condition from being offered at all.
 *
 * Pine strings can't contain a quote (pine.bnf: `char := [^']`), so a string
 * always ends at the next quote.
 */
export function mask(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === '--') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (two === '/*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (text[i] === "'") {
      const end = text.indexOf("'", i + 1);
      const stop = end === -1 ? text.length : end + 1;
      out += "'" + 'x'.repeat(Math.max(0, stop - i - 2)) + (end === -1 ? '' : "'");
      i = stop;
    } else {
      out += text[i];
      i++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// What Ctrl+S saves
// ---------------------------------------------------------------------------

/** The doc comment's text, without its comment markers. */
export function docText(rawComment: string): string {
  const raw = rawComment.trim();
  if (raw.startsWith('/*')) {
    return raw
      .replace(/^\/\*/, '')
      .replace(/\*\/$/, '')
      .split('\n')
      .map(l => l.replace(/^\s*\*?\s?/, '').trimEnd())
      .join('\n')
      .trim();
  }
  return raw
    .split('\n')
    .map(l => l.replace(/^\s*--\s?/, '').trimEnd())
    .join('\n')
    .trim();
}

export type SaveDraft = {
  /**
   * What to save: the whole tab, every block in order, with its comments.
   * The comments are the recipe's explanation.
   */
  expression: string;
  /**
   * A title to offer: the first line of the doc comment of the query under
   * the cursor, or else of the query itself.
   */
  title: string;
  /** How many queries the tab holds, not counting values blocks. */
  queryCount: number;
};

/**
 * What Ctrl+S saves from a tab: all of it. A tab can hold several queries
 * that belong together, such as an update and the delete after it, and a
 * recipe keeps them together. Blank lines between blocks become one. The
 * query under the cursor only suggests the title. A tab with only values
 * and no query has nothing to save.
 */
export function draftFromTab(text: string, cursorLine: number | undefined): SaveDraft | null {
  const blocks = splitExpressions(text).filter(b => b.text.trim());
  const queries = blocks.filter(b => !isValuesBlock(b.text));
  if (!queries.length) return null;
  const expression = blocks.map(b => b.text.trim()).join('\n\n');

  const at = findActiveQueryBlock(blocks, cursorLine);
  const titled = at >= 0 && !isValuesBlock(blocks[at].text) ? blocks[at].text : queries[0].text;
  const doc = leadingDoc(titled);
  const firstQueryLine =
    titled.slice(titled.indexOf(doc) + doc.length).split('\n').map(l => l.trim()).find(Boolean) ?? '';
  const titleSource = doc ? docText(doc).split('\n')[0] : firstQueryLine;
  return {
    expression,
    title: shorten(titleSource.replace(/\.\s*$/, '').trim(), 80),
    queryCount: queries.length,
  };
}

const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

// ---------------------------------------------------------------------------
// Values that can become variables
// ---------------------------------------------------------------------------

export type Literal = {
  /** Position of the value in the expression, quotes included. */
  start: number;
  end: number;
  /** The value as written, quotes included: `'Acme'` or `42`. */
  raw: string;
  kind: 'string' | 'number';
  /** The column it's compared with, without an alias: `name`. */
  column: string;
  /** The table that column most likely belongs to, without a schema: `company`. */
  table: string;
  /** A name to offer for the variable. */
  suggestedName: string;
};

const SYMBOL = '[A-Za-z_][A-Za-z0-9_-]*';
// pine.bnf's <operator>, longest first so `not like` isn't read as `not`.
const OPERATOR = String.raw`not\s+ilike|not\s+like|ilike|like|is\s+not|is|!\s*=|=|>|<`;
const CONDITION = new RegExp(
  String.raw`(?<![A-Za-z0-9_.$-])((?:${SYMBOL}\.)?(${SYMBOL}))\s*(?:${OPERATOR})\s*('x*'|''|\d+(?![A-Za-z0-9_]))`,
  'g',
);
const IN_LIST = new RegExp(String.raw`(?<![A-Za-z0-9_.$-])((?:${SYMBOL}\.)?(${SYMBOL}))\s*(?:not\s+)?in\s*\(([^)]*)\)`, 'g');
const OPERATION_WORDS = new Set(['where', 'w', 'select', 's', 'order', 'o', 'limit', 'l', 'group', 'g', 'count', 'describe', 'references', 'from', 'f', 'delete', 'update']);

/** The table of the pipe segment that `pos` sits in, looking back to the nearest one that starts with a table. */
function tableBefore(masked: string, pos: number): string {
  const segments = masked.slice(0, pos).split(/\|(?!=)/);
  for (let i = segments.length - 1; i >= 0; i--) {
    const m = new RegExp(`^\\s*((?:${SYMBOL}\\.)?(${SYMBOL}))(?=\\s*(?:$|\\.|as\\s|:(?:parent|child|left|right)\\b))`).exec(
      segments[i],
    );
    if (m && !OPERATION_WORDS.has(m[2])) return m[2];
  }
  return '';
}

function suggest(table: string, column: string): string {
  const base = (column === 'name' || column === 'id') && table ? `${table}_${column}` : column;
  return base.replace(/[^A-Za-z0-9_]/g, '_');
}

/** The string and number values in an expression's conditions and `update!` assignments, in order. */
export function findLiterals(expression: string): Literal[] {
  const masked = mask(expression);
  const out: Literal[] = [];
  const add = (start: number, raw: string, column: string) => {
    const table = tableBefore(masked, start);
    out.push({
      start,
      end: start + raw.length,
      raw: expression.slice(start, start + raw.length),
      kind: raw.startsWith("'") ? 'string' : 'number',
      column,
      table,
      suggestedName: suggest(table, column),
    });
  };
  for (const m of Array.from(masked.matchAll(CONDITION))) {
    const value = m[3];
    add(m.index! + m[0].length - value.length, value, m[2]);
  }
  for (const m of Array.from(masked.matchAll(IN_LIST))) {
    const listStart = m.index! + m[0].indexOf('(') + 1;
    for (const s of Array.from(m[3].matchAll(/'x*'|''/g))) add(listStart + s.index!, s[0], m[2]);
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Replace the chosen values with `$name` and describe each as a recipe input.
 * `chosen` maps a literal's index (in findLiterals order) to the variable
 * name the user picked. Names are made safe and unique.
 */
export function applyVariables(
  expression: string,
  literals: Literal[],
  chosen: Record<number, string>,
): { expression: string; inputs: RecipeInputDef[] } {
  let out = '';
  let last = 0;
  const inputs: RecipeInputDef[] = [];
  literals.forEach((l, i) => {
    out += expression.slice(last, l.start);
    last = l.end;
    if (chosen[i] === undefined) {
      out += l.raw;
      return;
    }
    let name = chosen[i].trim().replace(/[^A-Za-z0-9_]/g, '_') || 'value';
    if (/^[0-9]/.test(name)) name = `v_${name}`;
    // The same value used twice under the same name is one variable.
    const same = inputs.find(x => x.name === name);
    if (same && same.example === exampleOf(l) && same.kind === l.kind) {
      out += `$${name}`;
      return;
    }
    let unique = name;
    for (let n = 2; inputs.some(x => x.name === unique); n++) unique = `${name}_${n}`;
    out += `$${unique}`;
    inputs.push({ name: unique, example: exampleOf(l), kind: l.kind, column: l.table ? `${l.table}.${l.column}` : l.column });
  });
  return { expression: out + expression.slice(last), inputs };
}

const exampleOf = (l: Literal) => (l.kind === 'string' ? l.raw.slice(1, -1) : l.raw);

/**
 * A one-line summary of a recipe for lists: the first line of its query's top
 * comment, or of its explanation if it has one (recipes saved by an agent, or
 * before comments became the explanation).
 */
export function recipeSummary(r: { expression: string; explanation?: string }): string {
  const fromExplanation = (r.explanation ?? '').split('\n').map(l => l.trim()).find(Boolean);
  if (fromExplanation) return fromExplanation;
  // A recipe can start with its values block, so its comment is at the top
  // of its first query block.
  const firstQuery = splitExpressions(r.expression).find(b => !isValuesBlock(b.text))?.text ?? r.expression;
  const doc = leadingDoc(firstQuery) || leadingDoc(r.expression);
  return doc ? docText(doc).split('\n')[0].trim() : '';
}

/**
 * The text a recipe puts into a tab. Recipes saved with the old dialog
 * (before values were written in the text) carry their values as `inputs`;
 * they go in as a values block above the query.
 */
/**
 * What a recipe adds to a tab that already has `existing` in it. Values apply
 * to the whole tab, and a later values block wins, so the recipe's own value
 * for a `$name` the tab already sets would quietly change the results of the
 * queries already there. The tab's value is kept: the recipe's assignment of
 * that name is left out, and a values block with nothing else in it goes too.
 * Inserting the same recipe twice adds no second copy of its values.
 */
export function textToInsert(existing: string, recipe: string): string {
  const taken = valueNames(existing);
  if (!taken.size) return recipe;
  return splitExpressions(recipe)
    .map(b => (isValuesBlock(b.text) ? withoutValues(b.text, taken).trim() : b.text))
    .filter(t => t.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').trim() !== '')
    .join('\n\n');
}

/**
 * A tab's text with `addition` put in at the cursor, as blocks of its own,
 * and where the cursor goes after: the end of what was added.
 * - On a blank line between blocks, it goes there.
 * - Inside a block, it goes right after that block, so no query is cut in two.
 * - Without a cursor, it goes at the end.
 * One blank line separates it from the blocks around it.
 */
export function insertAtCursor(
  text: string,
  cursorLine: number | undefined,
  addition: string,
): { text: string; cursor: number } {
  const lines = text.split('\n');
  let at = lines.length; // the line the addition goes before
  if (cursorLine !== undefined && cursorLine < lines.length) {
    at = cursorLine;
    if (lines[cursorLine].trim()) {
      // Inside a block: after its last line.
      while (at < lines.length && lines[at].trim()) at++;
    }
  }
  const before = lines.slice(0, at).join('\n').replace(/\s+$/, '');
  const after = lines.slice(at).join('\n').replace(/^\s+/, '').replace(/\s+$/, '');
  const head = before ? `${before}\n\n${addition}` : addition;
  return { text: after ? `${head}\n\n${after}` : head, cursor: head.length };
}

export function recipeText(r: { expression: string; inputs: RecipeInputDef[] }): string {
  const lines = r.inputs
    .filter(i => i.example !== '')
    .map(i => `$${i.name} = ${i.kind === 'number' ? i.example : `'${i.example.replace(/'/g, '')}'`}`);
  return lines.length ? `${lines.join('\n')}\n\n${r.expression}` : r.expression;
}

/**
 * The recipes a search finds: every word of the query in the title, the
 * explanation or the expression, in any case: the Library's search.
 */
export function matchRecipes<T extends { title: string; explanation: string; expression: string }>(
  recipes: T[],
  query: string,
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return recipes.filter(r => {
    const hay = `${r.title} ${r.explanation} ${r.expression}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

/**
 * The name of the saved connection a recipe was saved from, or null when it
 * isn't one of yours. A recipe stores the database's hash, so its address is
 * never shown. One an older app saved stores the address itself, so both are
 * matched.
 */
export const savedFromLabel = (
  savedFrom: string | null,
  connections: { label: string; databaseKey?: string; databaseKeyHash?: string }[],
): string | null => savedFromConnection(savedFrom, connections)?.label ?? null;

/** The saved connection a recipe was saved from, or undefined when it isn't one of yours. */
export const savedFromConnection = <C extends { databaseKey?: string; databaseKeyHash?: string }>(
  savedFrom: string | null,
  connections: C[],
): C | undefined =>
  savedFrom ? connections.find(c => c.databaseKeyHash === savedFrom || c.databaseKey === savedFrom) : undefined;
