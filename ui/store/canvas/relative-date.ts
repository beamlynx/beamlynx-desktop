import { RelativeDateSelection } from './canvas.model';

/**
 * Loose name-based heuristic for "is this column a date/timestamp" - Pine's
 * hints (ColumnHint in store/client.ts) carry no DB type today, so this is
 * the only signal available client-side. False negatives just hide the two
 * extra dropdown entries below (the plain operator/value row still works);
 * false positives just offer them on a non-date column, where picking one
 * produces a condition that errors at query time the same way a hand-typed
 * bad literal would - not silent, not destructive.
 */
// snake_case suffixes (created_at, start_date, ...) and the exact bare names.
const DATE_COLUMN_PATTERN = /(_at|_on|_date|_time|_dob)$|^(date|dob|birthday)$/i;
// The same suffixes in camelCase (createdAt, startDate, ...) - a lowercase
// letter immediately followed by the capitalized suffix, so "updatedBy" or
// "endUserId" don't match (their tail isn't one of these words at all) the
// way "updated_by"/"end_user_id" don't match the snake pattern above.
const DATE_COLUMN_CAMEL_PATTERN = /[a-z](At|On|Date|Time|Dob)$/;
export const looksLikeDateColumn = (column: string): boolean =>
  DATE_COLUMN_PATTERN.test(column) || DATE_COLUMN_CAMEL_PATTERN.test(column);

/**
 * The two literals a relative-date selection compiles to - see
 * pine-actions.ts's addRelativeDateWhereCondition, which turns these
 * straight into `column > 'lowerExclusive'` and `column < 'upperExclusive'`.
 *
 * Pine's `date` literal is day-only (pine.bnf's `date` rule matches exactly
 * `'YYYY-MM-DD'`) and its `operator` rule has no `>=`/`<=` - so an inclusive
 * [start, end) range has to be built from a strict `>` one day before
 * `start` and a strict `<` at `end`. The upper bound is exact for both
 * `date` and `timestamp` columns. The lower bound is exact for `date`
 * columns but, for a `timestamp` column with a real time-of-day component,
 * over-includes by up to 24h at the start edge - there's no way to name
 * "one instant before midnight" without a time-of-day literal. That's
 * over-inclusion, never under-inclusion, and only at one edge: accepted as
 * a known limit of a convenience filter rather than blocked on a Pine
 * grammar change.
 */
export type DateBounds = { lowerExclusive: string; upperExclusive: string };

const pad = (n: number): string => String(n).padStart(2, '0');

// Formats from local getters, not toISOString - toISOString converts to UTC
// first, which silently shifts the date by a day in any negative-offset
// timezone.
const toDateString = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const addDays = (d: Date, days: number): Date => {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
};

const boundsFor = (start: Date, end: Date): DateBounds => ({
  lowerExclusive: toDateString(addDays(start, -1)),
  upperExclusive: toDateString(end),
});

export const computeDateBounds = (selection: RelativeDateSelection, now: Date = new Date()): DateBounds => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (selection.kind === 'today') return boundsFor(today, addDays(today, 1));

  const { count, unit } = selection;
  const start =
    unit === 'day'
      ? addDays(today, -count)
      : unit === 'week'
        ? addDays(today, -count * 7)
        : unit === 'month'
          ? new Date(today.getFullYear(), today.getMonth() - count, today.getDate())
          : new Date(today.getFullYear() - count, today.getMonth(), today.getDate());
  // Capped at "up to and including today", not left open-ended - a column
  // like expires_at routinely holds future dates, and an open upper bound
  // would silently pull those in under a "last N days" label.
  return boundsFor(start, addDays(today, 1));
};
