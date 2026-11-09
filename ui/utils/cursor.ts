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
