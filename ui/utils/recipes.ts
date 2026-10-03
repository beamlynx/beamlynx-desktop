// Recipes: saved Pine queries with values that are filled in each time.
// Storage lives in beamlynx-desktop (window.beamlynxDesktop.recipes). This
// module is the text side, kept free of React and MobX so the tests can run
// it directly:
//
//   - which blocks of a tab Ctrl+S saves, and the doc comment above them,
//   - which values in a query can become variables,
//   - turning chosen values into $name, and filling $name back in when a
//     recipe is used.
//
// Using a recipe is a macro: it puts the query into the tab as plain text,
// with the example values in place. So nothing here needs pine-lang to
// understand $name.
//
// See beamlynx-plans/pending/2026-10-01-recipes-shared-database-knowledge.md.
import { leadingDoc } from '../store/canvas/pine-text';
import { findActiveBlock, splitExpressions } from '../store/session';

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

const NAMED_RESULT = /\|=\s*([A-Za-z_][A-Za-z0-9_-]*)/g;

const definedNames = (masked: string) => Array.from(masked.matchAll(NAMED_RESULT)).map(m => m[1]);

const usesName = (masked: string, name: string) =>
  new RegExp(`(^|[^A-Za-z0-9_.$-])${name.replace(/-/g, '\\-')}($|[^A-Za-z0-9_-])`).test(
    masked.replace(NAMED_RESULT, ''),
  );

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
  /** The query to save: the block under the cursor, plus any block above it that it needs. */
  expression: string;
  /** From the first line of the block's doc comment, if it has one. */
  title: string;
  /** The rest of the doc comment. */
  explanation: string;
  /** Named results (`|= name`) defined in blocks above that the query uses, so they're saved too. */
  includedNames: string[];
};

/**
 * What Ctrl+S saves from a tab. The block under the cursor is the query that
 * runs, but running it also sends every block above it (session.ts), so a
 * block can use a named result defined further up. Those blocks are included
 * too, or the recipe wouldn't run on its own. The block's doc comment becomes
 * the title and explanation and is left out of the query.
 */
export function draftFromTab(text: string, cursorLine: number | undefined): SaveDraft | null {
  const blocks = splitExpressions(text);
  if (!blocks.length) return null;
  const active = cursorLine === undefined ? blocks.length - 1 : Math.max(0, findActiveBlock(blocks, cursorLine));

  const take = new Set([active]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const i of Array.from(take)) {
      for (let j = 0; j < i; j++) {
        if (take.has(j)) continue;
        if (definedNames(mask(blocks[j].text)).some(n => usesName(mask(blocks[i].text), n))) {
          take.add(j);
          grew = true;
        }
      }
    }
  }

  const doc = leadingDoc(blocks[active].text);
  const body = (b: { text: string }, i: number) =>
    i === active ? b.text.slice(b.text.indexOf(doc) + doc.length).replace(/^\s*\n/, '').trim() : b.text.trim();
  const ordered = Array.from(take).sort((a, b) => a - b);
  const expression = ordered.map(i => body(blocks[i], i)).filter(Boolean).join('\n\n');
  if (!expression) return null;

  const [first = '', ...rest] = doc ? docText(doc).split('\n') : [];
  return {
    expression,
    title: first.replace(/\.\s*$/, '').trim(),
    explanation: rest.join('\n').trim(),
    includedNames: ordered.filter(i => i !== active).flatMap(i => definedNames(mask(blocks[i].text))),
  };
}

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
const OPERATION_WORDS = new Set(['where', 'w', 'select', 's', 'order', 'o', 'limit', 'l', 'group', 'g', 'count', 'from', 'f', 'delete', 'update']);

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

// ---------------------------------------------------------------------------
// Using a recipe
// ---------------------------------------------------------------------------

/**
 * The recipe's query with each `$name` replaced by its example value, as the
 * plain text that goes into a tab. Also returns where the first filled-in
 * value sits (inside its quotes), so the editor can select it for typing over.
 */
export function fillRecipe(
  expression: string,
  inputs: RecipeInputDef[],
): { text: string; firstValue: { from: number; to: number } | null } {
  const byName = new Map(inputs.map(i => [i.name, i]));
  let firstValue: { from: number; to: number } | null = null;
  let text = '';
  let last = 0;
  for (const m of Array.from(expression.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g))) {
    const input = byName.get(m[1]);
    if (!input) continue;
    text += expression.slice(last, m.index);
    const value = input.kind === 'number' ? input.example : `'${input.example}'`;
    if (!firstValue) {
      const from = text.length + (input.kind === 'number' ? 0 : 1);
      firstValue = { from, to: from + input.example.length };
    }
    text += value;
    last = m.index! + m[0].length;
  }
  return { text: text + expression.slice(last), firstValue };
}
