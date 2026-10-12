import { format } from 'sql-formatter';

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
 * query text. Falls back to the raw, unformatted query (not '') on a
 * formatter error - the SQL panel/preview showing something unformatted is
 * far better than it silently showing nothing, which is exactly the bug
 * this replaced: sql-formatter throwing on MySQL's backtick identifiers
 * under a hardcoded 'postgresql' dialect, caught and discarded with no
 * visible error, left the panel simply blank.
 */
export function formatSql(query: string): string {
  if (!query) return '';
  try {
    return format(query, {
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
