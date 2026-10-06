// Blocks of the editor text: blank-line-separated expressions, and which one
// a build works on. Kept free of imports so any module can use it, the
// session store included, without an import cycle (store/values-blocks.ts
// and the canvas store both need it, and the session store loads the canvas
// store).

export type ExpressionBlock = { text: string; startLine: number };

/**
 * Whether `line` leaves a block comment open behind it, given it
 * started `open`. A `/*` inside a string literal (`'image/*'`) or after a
 * `--` line comment opens nothing, as in pine-lang's grammar. A string can't
 * span lines in Pine, so one left unclosed ends with the line.
 */
function blockCommentOpenAfter(line: string, open: boolean): boolean {
  let i = 0;
  while (i < line.length) {
    if (open) {
      const close = line.indexOf('*/', i);
      if (close === -1) return true;
      open = false;
      i = close + 2;
    } else if (line[i] === "'") {
      const close = line.indexOf("'", i + 1);
      if (close === -1) return false;
      i = close + 1;
    } else if (line.startsWith('--', i)) {
      return false;
    } else if (line.startsWith('/*', i)) {
      open = true;
      i += 2;
    } else {
      i++;
    }
  }
  return open;
}

/**
 * Split the editor text into blank-line-separated expression blocks.
 *
 * A blank line inside an open block comment is not a boundary. A doc comment
 * at the top of a tab is exactly the place someone writes a paragraph break
 * (see pine-lang's docs/comments.md), and splitting there would hand the
 * server an unterminated comment as block 0 and the comment's own tail as
 * block 1 - a parse error out of text that is perfectly valid Pine.
 *
 * Exported only so __tests__/expression-blocks.test.js can cover that rule
 * directly; nothing outside this module uses it.
 */
export function splitExpressions(text: string): ExpressionBlock[] {
  const lines = text.split('\n');
  const blocks: ExpressionBlock[] = [];
  let current: string[] = [];
  let currentStart = 0;
  let inBlockComment = false;

  for (let i = 0; i <= lines.length; i++) {
    const line = lines[i];
    if (i < lines.length) {
      const wasOpen = inBlockComment;
      inBlockComment = blockCommentOpenAfter(line, inBlockComment);
      if (wasOpen && line.trim() === '') {
        if (current.length === 0) currentStart = i;
        current.push(line);
        continue;
      }
    }
    if (i === lines.length || line.trim() === '') {
      const joined = current.join('\n').trim();
      if (joined) blocks.push({ text: joined, startLine: currentStart });
      current = [];
      currentStart = i + 1;
    } else {
      if (current.length === 0) currentStart = i;
      current.push(line);
    }
  }
  return blocks;
}

/**
 * Whether a block is a values block (`$name = value` lines only, see
 * store/values-blocks.ts): its first character after comments is `$`.
 *
 * The leading comments are stripped first and the `$` checked after, like
 * pine-lang's `values-block?`. Testing both in one pattern let the pattern
 * stop part-way through a comment to reach a `$` in it, so a query whose
 * comment mentioned `US$` read as a values block.
 */
export const isValuesBlock = (text: string): boolean =>
  text.replace(/^(?:\s|--[^\n]*|\/\*[\s\S]*?\*\/)*/, '').startsWith('$');

/**
 * The block a build works on: the one under the cursor, unless that's a
 * values block, which has no query of its own; then the next query block
 * below it, or failing that the nearest above.
 */
export function findActiveQueryBlock(blocks: ExpressionBlock[], cursorLine: number | undefined): number {
  const at = cursorLine !== undefined ? findActiveBlock(blocks, cursorLine) : blocks.length - 1;
  if (!blocks[at] || !isValuesBlock(blocks[at].text)) return at;
  for (let i = at + 1; i < blocks.length; i++) if (!isValuesBlock(blocks[i].text)) return i;
  for (let i = at - 1; i >= 0; i--) if (!isValuesBlock(blocks[i].text)) return i;
  return at;
}

/**
 * What a build sends: the blocks up to the active one, plus any values blocks
 * after it. pine-lang takes values blocks out and builds the last block left,
 * and a value applies to the whole tab wherever it's written.
 */
export function blocksForBuild(blocks: ExpressionBlock[], activeIdx: number): string[] {
  return [
    ...blocks.slice(0, activeIdx + 1).map(b => b.text),
    ...blocks.slice(activeIdx + 1).filter(b => isValuesBlock(b.text)).map(b => b.text),
  ];
}

/**
 * The cursor as the server sees it: its position within the block being
 * built, or none when it is above that block. That happens with the cursor in
 * a values block, which builds the query below it. A position before the
 * block's first line would make the server fail the build.
 */
export function cursorForBuild<C extends { line: number }>(
  blocks: ExpressionBlock[],
  activeIdx: number,
  cursor: C | undefined,
): C | undefined {
  const block = blocks[activeIdx];
  if (!cursor || !block) return cursor;
  if (cursor.line < block.startLine) return undefined;
  return { ...cursor, line: cursor.line - block.startLine };
}

export function findActiveBlock(blocks: ExpressionBlock[], cursorLine: number): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].startLine <= cursorLine) return i;
  }
  return blocks.length - 1;
}
