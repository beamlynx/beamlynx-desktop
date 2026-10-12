import type { SqlConversion } from '../store/session';

/**
 * What the line under the SQL editor says. It speaks only when the canvas
 * and the SQL disagree: the SQL didn't convert, so the canvas still shows
 * an earlier query, or it converted with a difference worth knowing. When
 * the canvas shows what was typed, it says nothing, as the Pine panel does.
 *
 * Not an error: SQL that doesn't convert can still run. Errors that stop a
 * query from running go in the band above the results (ErrorMessage.tsx).
 */
export function sqlConversionLines({ message, warnings }: SqlConversion): string[] {
  if (message) return [`The canvas isn't showing this query. ${message}`];
  return warnings;
}
