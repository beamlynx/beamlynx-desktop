import type { JsonPathStep, Unnest } from './client';

/**
 * Editing a value inside the elements of `unnest: data.items as e` from the
 * results grid. An element has no key of its own: it is found again by its
 * table's record key and its position in the array, which pine-lang sends
 * per row in a hidden column (`__e__index`). With them, `e.qty` in a row
 * becomes `data.items[1].qty` of that row's table.
 */

/** Where an edit of an element value is written: a key inside a table's JSON column. */
export type ElementEditTarget = { alias: string; column: string; path: JsonPathStep[] };

/**
 * The table, column and path that `path` inside the element `alias` is in this
 * row: `{alias: 'd_0', column: 'data', path: ['items', 1, 'qty']}`. Elements
 * of elements have a position at each level. A string saying why not, when a
 * position is missing; null when `alias` isn't an element.
 */
export const elementEditTarget = (
  alias: string,
  path: JsonPathStep[],
  row: Record<string, unknown>,
  unnests: Unnest[],
  indexFields: Record<string, string>,
): ElementEditTarget | string | null => {
  const byAlias = new Map(unnests.map(u => [u.alias, u]));
  if (!byAlias.has(alias)) return null;

  // The element `a` itself, as a path from its table's column.
  const elementPath = (a: string, seen: Set<string>): ElementEditTarget | string => {
    const u = byAlias.get(a);
    if (!u || seen.has(a)) return `the place of ${a} in its array isn't known`;
    const field = indexFields[a];
    // Number(null) is 0, a real position, so an empty value is checked first.
    const value = field === undefined ? undefined : row[field];
    const position =
      value === undefined || value === null || value === '' ? undefined : Number(value);
    if (position === undefined || !Number.isInteger(position)) {
      return `this row has no position for ${a} in its array`;
    }
    let array: ElementEditTarget | string;
    if (u.column) {
      array = { alias: u.source ?? u.table, column: u.column, path: u.path ?? [] };
    } else {
      const outer = elementPath(u.source ?? '', new Set(Array.from(seen).concat(a)));
      if (typeof outer === 'string') return outer;
      array = { ...outer, path: [...outer.path, ...(u.path ?? [])] };
    }
    return { ...array, path: [...array.path, position] };
  };

  const element = elementPath(alias, new Set());
  if (typeof element === 'string') return element;
  return { ...element, path: [...element.path, ...path] };
};
