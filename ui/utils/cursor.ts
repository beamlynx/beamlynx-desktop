const isSpace = (c: string) => /\s/.test(c);

/**
 * Where the cursor goes when `before` is replaced by `after`, a version of it
 * that differs in whitespace only, as Pine's prettifier makes: the same
 * place, after the same number of characters that aren't whitespace. At the
 * end of `before`, it stays at the end.
 */
export const cursorAfterReformat = (before: string, after: string, cursor: number): number => {
  if (cursor >= before.length) return after.length;
  let count = 0;
  for (let i = 0; i < cursor; i++) if (!isSpace(before[i])) count++;
  if (count === 0) return 0;
  for (let i = 0; i < after.length; i++) {
    if (!isSpace(after[i]) && --count === 0) return i + 1;
  }
  return after.length;
};

/**
 * Whether two texts differ in whitespace only. Pine's prettifier drops a
 * comment between steps, so a tidy that changed more than whitespace is not
 * applied: it would delete the comment.
 */
export const sameApartFromWhitespace = (a: string, b: string): boolean =>
  a.replace(/\s/g, '') === b.replace(/\s/g, '');

/**
 * After a tidy, a cursor right after a `|` moves past the space the
 * prettifier puts after it (`\n | `), so the next step is typed after it.
 */
export const pastSpaceAfterPipe = (text: string, cursor: number): number => {
  if (text[cursor - 1] !== '|') return cursor;
  while (text[cursor] === ' ') cursor++;
  return cursor;
};

/**
 * Whether `cursor` is at the end of its query: only whitespace follows it
 * before a blank line, which starts the next query, or the end of the text.
 */
export const isAtEndOfBlock = (text: string, cursor: number): boolean => {
  const rest = text.slice(cursor);
  const space = rest.match(/^\s*/)![0];
  return space.length === rest.length || /\n[ \t]*\n/.test(space);
};

/** The offset of a 0-based line and character in `text`. */
export const offsetOf = (text: string, line: number, character: number): number => {
  const lines = text.split('\n');
  if (line >= lines.length) return text.length;
  let offset = 0;
  for (let i = 0; i < line; i++) offset += lines[i].length + 1;
  return offset + Math.min(character, lines[line].length);
};
