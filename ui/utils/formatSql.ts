import { observable, runInAction } from 'mobx';

// sql-formatter is loaded the first time something formats SQL, not with
// the app: it is about 220 KB, all nineteen of its dialects in one module
// that can't be split, and nothing shows formatted SQL until the SQL panel
// opens. Until it has loaded, formatSql returns the SQL as it is. The
// loaded module is observable, so whatever showed the unformatted SQL
// (Session's `query`) shows it formatted once it arrives.
type SqlFormatter = typeof import('sql-formatter');
const formatter = observable.box<SqlFormatter | null>(null, { deep: false });
let loading: Promise<void> | null = null;

/** Load the formatter. formatSql formats from the moment this resolves. */
export function loadSqlFormatter(): Promise<void> {
  loading ??= import('sql-formatter').then(m => runInAction(() => formatter.set(m)));
  return loading;
}

// sql-formatter needs an explicit dialect and has no ambiguity-tolerant
// mode: MySQL's backtick-quoted identifiers throw a hard parse error under
// any dialect but 'mysql'/'mariadb', while Postgres never emits backticks.
// Detecting from the query text itself (rather than plumbing a connection's
// dialect through the API/session into every caller) is enough - it's the
// one unambiguous signal already sitting right there in the string every
// caller already has.
function detectLanguage(query: string): 'mysql' | 'postgresql' {
  return query.includes('`') ? 'mysql' : 'postgresql';
}

// A Pine `$name` variable with no value yet reaches the SQL as `$name`, which
// sql-formatter doesn't know as a parameter and refuses to parse. Declaring
// it as a custom parameter keeps the panel formatted while a value is missing.
// `?` (positional) and Postgres's `$1` (numbered) are listed too, because
// setting paramTypes replaces the dialect's defaults.
const paramTypes = {
  positional: true,
  numbered: ['$' as const],
  custom: [{ regex: String.raw`\$[A-Za-z_][A-Za-z0-9_]*` }],
};

/**
 * Pretty-prints a compiled SQL query for display, dialect-detected from the
 * query text. Returns it as it is until the formatter has loaded (see
 * loadSqlFormatter). Falls back to the raw, unformatted query (not '') on a
 * formatter error - the SQL panel/preview showing something unformatted is
 * far better than it silently showing nothing, which is exactly the bug
 * this replaced: sql-formatter throwing on MySQL's backtick identifiers
 * under a hardcoded 'postgresql' dialect, caught and discarded with no
 * visible error, left the panel simply blank.
 */
export function formatSql(query: string): string {
  if (!query) return '';
  const loaded = formatter.get();
  if (!loaded) {
    void loadSqlFormatter().catch(e => console.warn('formatSql: could not load the formatter', e));
    return query;
  }
  try {
    return loaded.format(query, {
      language: detectLanguage(query),
      indentStyle: 'tabularRight',
      denseOperators: false,
      paramTypes,
    });
  } catch (e) {
    // warn, not error: in `next dev` an error opens the overlay over the
    // canvas, though the panel already shows the query unformatted.
    console.warn('formatSql: failed to format SQL, showing it unformatted', e);
    return query;
  }
}
