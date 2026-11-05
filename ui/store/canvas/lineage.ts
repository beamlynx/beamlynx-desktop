// The tab's query blocks as a small graph, drawn at the top of the canvas
// apart from the join graph (see layout.ts's layoutLineage): one chip per
// block to switch to it, and arrows for which block is made from which.
// A join says how two tables' rows match up; a derivation says that one
// query's result is built from another's. They are different
// relations, so they are drawn differently, and in different places.

import { mayChangeData } from './pine-text';

/** How a block reads an earlier one: as a table (`grouped as g`), or after `in` (`where: id in keep`). */
export type LineageUse = 'table' | 'in';

/** `from` and `to` are block ids (LineageBlock.id). */
export type LineageEdge = { from: string; to: string; use: LineageUse };

/**
 * One query block in the strip. `id` is its position among the tab's query
 * blocks, so two blocks can have the same name. `label` is its `|= name`,
 * or its number when it has no name. `write`: it ends in update! or delete!.
 */
export type LineageBlock = { id: string; name: string | null; label: string; write: boolean };

/** The tab's query blocks in order, which reads which, and the one the canvas draws. */
export type Lineage = { blocks: LineageBlock[]; edges: LineageEdge[]; active: number };

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
 * The lineage of a tab's query blocks, in order: each with its `|= name`,
 * or null. A block can only read the named blocks above it. When a name is
 * used twice, a block reads the nearest one above it.
 */
export const lineageOf = (blocks: { name: string | null; text: string }[], active: number): Lineage => {
  const edges: LineageEdge[] = [];
  blocks.forEach((b, k) => {
    const latest = new Map<string, number>();
    blocks.slice(0, k).forEach((e, i) => e.name && latest.set(e.name, i));
    for (const { name, use } of blockUses(b.text, Array.from(latest.keys()))) {
      edges.push({ from: String(latest.get(name)), to: String(k), use });
    }
  });
  return {
    blocks: blocks.map((b, k) => ({
      id: String(k),
      name: b.name,
      label: b.name ? `|= ${b.name}` : String(k + 1),
      write: mayChangeData(b.text),
    })),
    edges,
    active,
  };
};
