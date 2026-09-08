/**
 * A cell counts as JSON only once parsed AND shaped like an object/array -
 * a bare number or quoted string parses fine under JSON.parse but isn't
 * what a user means by "this column holds JSON", and would false-positive
 * on perfectly ordinary numeric/text columns.
 */
export function parseJsonCellValue(value: unknown): unknown | undefined {
  if (value === null || value === undefined) return undefined;
  // Some server responses embed already-decoded jsonb as a nested object/
  // array rather than a re-stringified string - accept that shape directly
  // rather than only ever expecting a string to parse.
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether `field` should be treated as a JSON column across the whole grid -
 * sampling rather than checking every row so a huge result set doesn't pay
 * for a full scan just to decide how to render. One real JSON value among
 * the sample is enough: a jsonb column's only non-JSON rows are nulls,
 * which parseJsonCellValue already treats as "no verdict" rather than "not
 * JSON".
 */
export function columnLooksLikeJson(
  rows: Record<string, unknown>[],
  field: string,
  sampleSize = 30,
): boolean {
  const limit = Math.min(rows.length, sampleSize);
  for (let i = 0; i < limit; i++) {
    if (parseJsonCellValue(rows[i]?.[field]) !== undefined) return true;
  }
  return false;
}

export function prettyJson(parsed: unknown): string {
  return JSON.stringify(parsed, null, 2);
}

/**
 * Commit-time gate for a JSON editor's text: re-parses whatever the user
 * left in the editor (which is prettified for readability, not what should
 * ever reach the database) and, if valid, hands back the minified form -
 * jsonb doesn't preserve whitespace, so this loses nothing while sidestepping
 * every question of whether Pine's `'...'` string literal can carry a raw
 * newline. Invalid JSON is reported rather than silently sent through
 * as-is - see Result.tsx's updateRecord.
 */
export function minifyJsonText(text: string): { ok: true; value: string } | { ok: false } {
  try {
    return { ok: true, value: JSON.stringify(JSON.parse(text)) };
  } catch {
    return { ok: false };
  }
}
