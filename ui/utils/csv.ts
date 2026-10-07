/**
 * One CSV cell for a result value, safe to open in a spreadsheet.
 *
 * - Objects and arrays (JSON columns) are written as JSON, not
 *   "[object Object]".
 * - A value starting with = + - @, a tab or a carriage return is prefixed
 *   with an apostrophe. Excel and LibreOffice run such a cell as a formula,
 *   so a database value like =HYPERLINK("http://...") would otherwise act
 *   when the export is opened.
 * - A value containing a comma, quote, newline or carriage return is quoted,
 *   with quotes doubled.
 */
export const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text) || text.startsWith("'")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};
