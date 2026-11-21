import { PickerGroup, PickerItem } from './canvas.model';
import { fuzzyFilter } from './fuzzy';

/**
 * Filtering a list picker's items by what is typed in its box. A column
 * picker lists every table's columns (beamlynx-plans #28), so its filter
 * can name tables first:
 *
 * - `t.id` is the id of the table aliased `t` (or named `t`).
 * - `tenant id` is the id of every tenant table in the query, and so is
 *   `id tenant`. The first word, or else the last, is a table's name or
 *   alias, or the start of a table's name.
 *
 * When the filter names no table, or the tables it names have no match,
 * it filters as typed: a dot then starts a key inside a JSON column,
 * `data.city`, and spaces are ignored, so `tenant id` finds `tenant_id`.
 */

type Scope = { aliases: Set<string>; rest: string };

const filterItems = (items: PickerItem[], filter: string): PickerItem[] => fuzzyFilter(items, filter, i => i.label);

const namedTables = (groups: PickerGroup[], filter: string): Scope | null => {
  const q = filter.trim().toLowerCase();
  const tables = groups.filter(g => g.alias);
  const is = (g: PickerGroup, word: string) => g.alias!.toLowerCase() === word || g.table?.toLowerCase() === word;
  const scope = (named: PickerGroup[], rest: string) =>
    named.length ? { aliases: new Set(named.map(g => g.alias!)), rest } : null;
  const dot = q.match(/^([^\s.]+)\.(\S*)$/);
  if (dot) return scope(tables.filter(g => is(g, dot[1])), dot[2]);
  // The table's word comes first, `tenant id`, or last, `id tenant`.
  const words = q.split(/\s+/);
  if (words.length < 2) return null;
  const named = (word: string) => {
    const exact = tables.filter(g => is(g, word));
    return exact.length ? exact : tables.filter(g => g.table?.toLowerCase().startsWith(word));
  };
  const first = named(words[0]);
  if (first.length) return scope(first, words.slice(1).join(' '));
  return scope(named(words[words.length - 1]), words.slice(0, -1).join(' '));
};

const scoped = (group: PickerGroup, filter: string, scope: Scope | null): PickerItem[] => {
  if (!scope || !group.alias) return filterItems(group.items, filter);
  return scope.aliases.has(group.alias) ? filterItems(group.items, scope.rest) : [];
};

/** Each group's items that `filter` keeps, best match first. Groups line up with `groups`. */
export const filterGroups = (groups: PickerGroup[], filter: string): PickerItem[][] => {
  const scope = namedTables(groups, filter);
  const result = groups.map(g => scoped(g, filter, scope));
  if (scope && result.every(items => items.length === 0)) return groups.map(g => filterItems(g.items, filter));
  return result;
};
