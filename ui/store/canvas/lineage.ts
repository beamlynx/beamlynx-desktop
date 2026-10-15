// Which query block is made from which: the tab's blocks as a small graph,
// drawn at the top of the canvas apart from the join graph (see layout.ts's
// layoutLineage). A join says how two tables' rows match up; a derivation
// says that one query's result is built from another's. They are different
// relations, so they are drawn differently, and in different places.

/** How a block reads an earlier one: as a table (`grouped as g`), or after `in` (`where: id in keep`). */
export type LineageUse = 'table' | 'in';

export type LineageEdge = { from: string; to: string; use: LineageUse };

/**
 * The tab's query blocks in order, by name, and which reads which. The last
 * block has no name; it is `LINEAGE_MAIN`.
 */
export type Lineage = { names: string[]; edges: LineageEdge[] };

export const LINEAGE_MAIN = '';

// The text with its strings and comments blanked out, so a name inside
// either is never read as a use.
const code = (text: string): string =>
  text.replace(/'(?:[^']|'')*'?|--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/g, m => ' '.repeat(m.length));

/**
 * The earlier block names `text` reads, each once, with how. A name is read
 * as a table when a step starts with it (`grouped as g .id = .id`), and as a
 * set after `in` or `not in`. Read from the text rather than the build, so
 * it holds while a block is still building and inside sealed stages.
 */
export const blockUses = (text: string, earlier: string[]): { name: string; use: LineageUse }[] => {
  const known = new Set(earlier);
  const found = new Map<string, LineageUse>();
  const body = code(text);
  for (const segment of body.split('|')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)(?![A-Za-z0-9_.:])/.exec(segment);
    if (m && known.has(m[1])) found.set(m[1], 'table');
  }
  const inSet = /(?<![A-Za-z0-9_])in\s+([A-Za-z_][A-Za-z0-9_]*)(?![A-Za-z0-9_])/g;
  let m: RegExpExecArray | null;
  while ((m = inSet.exec(body))) {
    if (known.has(m[1]) && !found.has(m[1])) found.set(m[1], 'in');
  }
  return Array.from(found, ([name, use]) => ({ name, use }));
};

/**
 * The lineage of a tab's query blocks: `blocks` are the named ones in order,
 * `main` is the last block's text. A block can only read the blocks above it.
 */
export const lineageOf = (blocks: { name: string; text: string }[], main: string): Lineage => {
  const edges: LineageEdge[] = [];
  const all = [...blocks, { name: LINEAGE_MAIN, text: main }];
  all.forEach((b, k) => {
    const earlier = blocks.slice(0, k).map(e => e.name);
    for (const { name, use } of blockUses(b.text, earlier)) edges.push({ from: name, to: b.name, use });
  });
  return { names: blocks.map(b => b.name), edges };
};
