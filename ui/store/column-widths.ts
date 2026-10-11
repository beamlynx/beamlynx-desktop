import type { Ast } from './client';

/**
 * Remembered column widths, desktop only. They live in the app's SQLite
 * file (beamlynx-desktop's app-db.ts, the `column_width` table), per
 * connection, so a width you drag stays for that column the next time it
 * shows up, in any tab. The file keeps the most recently used ones and drops
 * the oldest past a limit. The web build doesn't remember widths.
 */

/**
 * The name a column's width is remembered under: `table.heading`, or
 * `expr:heading` for a column no table is known for, like a count.
 *
 * A grid column's own field is its position, which means nothing in the
 * next result. The schema is left out because pine-lang doesn't always say
 * it, and a width shared by two schemas' same-named tables does no harm.
 */
export const columnWidthKey = (ast: Ast | null, alias: string, heading: string): string => {
  const table = tableOfAlias(ast, alias);
  return table ? `${table}.${heading}` : `expr:${heading}`;
};

const tableOfAlias = (ast: Ast | null, alias: string): string | null => {
  if (!ast || !alias) return null;
  const selected = ast['selected-tables']?.find(t => t.alias === alias);
  if (selected) return selected.table;
  // A query that ends on a table (`user`) leaves that table out of
  // selected-tables. The operation still names it.
  const value = ast.operation?.type === 'table' ? (ast.operation.value as { table?: unknown } | undefined) : undefined;
  if (alias === ast.current && typeof value?.table === 'string') return value.table;
  return null;
};

const appDb = () => (typeof window === 'undefined' ? undefined : window.beamlynxDesktop?.appDb);

// Loaded once per connection, then kept up to date by saveColumnWidth.
const loaded = new Map<string, Promise<Record<string, number>>>();

/** The widths remembered for a connection. Empty on the web build, or if they can't be read. */
export const loadColumnWidths = (connection: string): Promise<Record<string, number>> => {
  const db = appDb();
  if (!connection || !db?.getColumnWidths) return Promise.resolve({});
  let widths = loaded.get(connection);
  if (!widths) {
    widths = db.getColumnWidths(connection).catch((error: unknown) => {
      console.warn('Could not read remembered column widths.', error);
      loaded.delete(connection);
      return {};
    });
    loaded.set(connection, widths);
  }
  return widths;
};

/** Remembers one column's width. The grid reports a width once, when a drag ends. */
export const saveColumnWidth = (connection: string, key: string, width: number) => {
  const db = appDb();
  if (!connection || !db?.setColumnWidths) return;
  const rounded = Math.round(width);
  if (!(rounded > 0 && rounded < 100_000)) return;
  void loadColumnWidths(connection).then(widths => {
    widths[key] = rounded;
  });
  db.setColumnWidths(connection, { [key]: rounded }).catch((error: unknown) =>
    console.warn('Could not remember a column width.', error),
  );
};

/** Forgets the loaded widths, so a test starts clean. */
export const resetColumnWidthsForTests = () => loaded.clear();
