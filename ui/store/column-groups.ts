import { ColumnHint, Table } from './client';

/**
 * Column hints come from every table the query can see (pine-lang #194),
 * grouped by table: the current table first, then the others, nearest in
 * the pipe first. These helpers name a group and write a column the way
 * the Pine panel and the canvas both show it.
 */

/** A group's header: `user (u)`, or just the alias for a named result or checkpoint. */
export const columnGroupName = (alias: string, tables: Table[]): string => {
  const table = tables.find(t => t.alias === alias);
  return table && table.table !== alias ? `${table.table} (${alias})` : alias;
};

/** The column as Pine needs it: bare for the current table, `u.email` for any other. */
export const qualifiedColumn = (hint: ColumnHint, current: string | undefined): string =>
  hint.alias === current ? hint.column : `${hint.alias}.${hint.column}`;

/** Each alias's place among the groups, in the order the hints first name it. */
export const groupRanks = (hints: ColumnHint[]): Map<string, number> => {
  const ranks = new Map<string, number>();
  for (const hint of hints) if (!ranks.has(hint.alias)) ranks.set(hint.alias, ranks.size);
  return ranks;
};
