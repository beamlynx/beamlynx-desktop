// Which part of a statement's SQL each query block wrote.
//
// pine-lang writes a block that ends in `|= name` as a WITH query of that
// name inside the SQL of the blocks that read it. The SQL panel uses these
// parts to show the block the canvas draws: its WITH query, or for the
// statement's own block, the rest of the statement.
// Pure text work: no imports, so the session store and tests can use it.

export type Range = { from: number; to: number };

/** A WITH query: its name, and where it starts (the name) and ends (its `)`). */
type WithQuery = { name: string; from: number; to: number };

type Token = { text: string; quoted: boolean; from: number; to: number };

/**
 * The SQL's words, quoted names and brackets, in order. Strings and comments
 * are left out, so a `(` or `AS` inside one counts for nothing.
 */
function tokens(sql: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'") {
      // A string. '' inside it is a quote, not its end.
      i++;
      while (i < sql.length && !(sql[i] === "'" && sql[i + 1] !== "'")) i += sql[i] === "'" ? 2 : 1;
      i++;
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
    } else if (c === '"' || c === '`') {
      const end = sql.indexOf(c, i + 1);
      const to = end === -1 ? sql.length : end + 1;
      out.push({ text: sql.slice(i + 1, to - 1), quoted: true, from: i, to });
      i = to;
    } else if (c === '(' || c === ')') {
      out.push({ text: c, quoted: false, from: i, to: i + 1 });
      i++;
    } else if (/[A-Za-z0-9_]/.test(c)) {
      const from = i;
      while (i < sql.length && /[A-Za-z0-9_$]/.test(sql[i])) i++;
      out.push({ text: sql.slice(from, i), quoted: false, from, to: i });
    } else {
      i++;
    }
  }
  return out;
}

/** Every `name AS ( ... )` in the SQL, in the order they start. */
export function withQueries(sql: string): WithQuery[] {
  const ts = tokens(sql);
  // Where each `(` closes.
  const closes = new Map<number, number>();
  const open: number[] = [];
  ts.forEach((t, k) => {
    if (!t.quoted && t.text === '(') open.push(k);
    if (!t.quoted && t.text === ')' && open.length) closes.set(open.pop()!, k);
  });
  const found: WithQuery[] = [];
  for (let k = 0; k + 2 < ts.length; k++) {
    const [name, as, paren] = [ts[k], ts[k + 1], ts[k + 2]];
    if (as.quoted || as.text.toUpperCase() !== 'AS' || paren.quoted || paren.text !== '(') continue;
    if (!name.quoted && !/^[A-Za-z_]/.test(name.text)) continue;
    const close = closes.get(k + 2);
    if (close === undefined) continue;
    found.push({ name: name.text, from: name.from, to: ts[close].to });
  }
  return found;
}

/** Whether a WITH query called `query` is the one Pine wrote for `|= name`. */
const isNamed = (query: string, name: string) =>
  query === name || new RegExp(`^${name}_\\d+$`).test(query);

/**
 * The parts of one statement's SQL that each block wrote.
 *
 * `named` is the blocks ending in `|= name` that come before the statement's
 * own block, in order. Each gets its WITH query, and the WITH queries just
 * before it that no named block wrote: Pine adds those for a `group:` or a
 * `limit:` inside a block, and they come right before the block's own.
 * The statement's own block (`main`) gets the rest of the text.
 *
 * A named block the statement doesn't read gets no range.
 */
export function sqlBlockRanges(
  sql: string,
  named: { index: number; name: string }[],
  main: number,
): Map<number, Range[]> {
  const queries = withQueries(sql);
  // Each WITH query's block, where a named block wrote it.
  const owner = new Map<number, number>();
  let from = 0;
  for (const { index, name } of named) {
    const at = queries.findIndex((q, k) => k >= from && isNamed(q.name, name));
    if (at === -1) continue;
    owner.set(at, index);
    from = at + 1;
  }
  const ranges = new Map<number, Range[]>();
  let start: number | null = null;
  queries.forEach((q, k) => {
    // A WITH query inside another one is part of that one.
    if (queries.some((outer, j) => j < k && outer.from < q.from && q.to <= outer.to)) return;
    if (start === null) start = q.from;
    const index = owner.get(k);
    if (index === undefined) return;
    ranges.set(index, [...(ranges.get(index) ?? []), { from: start, to: q.to }]);
    start = null;
  });

  // The statement's own block: what is left, without the gaps between the
  // named parts (a comma, the line break).
  const taken = Array.from(ranges.values())
    .flat()
    .sort((a, b) => a.from - b.from);
  const rest: Range[] = [];
  let at = 0;
  for (const r of [...taken, { from: sql.length, to: sql.length }]) {
    const text = sql.slice(at, r.from);
    if (text.replace(/[\s,]/g, '') !== '') rest.push(trim(sql, { from: at, to: r.from }));
    at = Math.max(at, r.to);
  }
  if (rest.length) ranges.set(main, rest);
  return ranges;
}

/** `range` without the whitespace and commas at its ends. */
function trim(sql: string, { from, to }: Range): Range {
  while (from < to && /[\s,]/.test(sql[from])) from++;
  while (to > from && /[\s,]/.test(sql[to - 1])) to--;
  return { from, to };
}
