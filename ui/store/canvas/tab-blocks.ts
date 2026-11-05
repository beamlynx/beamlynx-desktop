// A tab as the canvas sees it: its query blocks and its values blocks. The
// canvas draws one query: the one under the editor's cursor (see mainQuery),
// picked in the strip at the top of the canvas. Earlier blocks ending in
// `|= name` are nested queries of it.
// Pure text work, no network: the canvas store builds each block itself.
import { ExpressionBlock, findActiveQueryBlock, isValuesBlock, splitExpressions } from '../blocks';

export type TabBlocks = {
  blocks: ExpressionBlock[];
  /** Indices into `blocks` of the query blocks, in order. */
  queries: number[];
  /** Each query block's `|= name`, or null for a query of its own. The last block's entry is always null. */
  names: (string | null)[];
};

// Comments and whitespace at the end of a block, so `... |= x -- note` still
// ends in `|= x`.
const TRAILING_NOISE = /(?:\s|--[^\n]*$|\/\*[\s\S]*?\*\/)*$/;

/** The name of a block ending in `|= name`, or null. */
export const blockName = (text: string): string | null => {
  // `|= name`, or `| = name` as the canvas and the prettifier write it.
  const m = /\|\s*=\s*([A-Za-z_][A-Za-z0-9_]*)$/.exec(text.replace(TRAILING_NOISE, ''));
  return m ? m[1] : null;
};

/** The tab split for the canvas. A tab with no query block has an empty last query. */
export function tabBlocks(expression: string): TabBlocks {
  const blocks = splitExpressions(expression);
  const queries = blocks.map((b, i) => (isValuesBlock(b.text) ? -1 : i)).filter(i => i >= 0);
  const names = queries.map((q, k) => (k === queries.length - 1 ? null : blockName(blocks[q].text)));
  return { blocks, queries, names };
}

/**
 * The query block the canvas draws (an index into `queries`): the one under
 * the cursor, the same block the session builds and runs. Without a cursor,
 * the last.
 */
export function mainQuery(tab: TabBlocks, cursorLine: number | undefined): number {
  const last = Math.max(tab.queries.length - 1, 0);
  if (cursorLine === undefined || tab.queries.length === 0) return last;
  const at = tab.queries.indexOf(findActiveQueryBlock(tab.blocks, cursorLine));
  return at < 0 ? last : at;
}

/** The text of query block `k` (an index into `queries`), or '' when there is none. */
export const queryText = (tab: TabBlocks, k: number): string =>
  tab.queries[k] === undefined ? '' : tab.blocks[tab.queries[k]].text;

/**
 * What a build of query block `k` sends before it: every block above it, and
 * the values blocks below it (a value applies to the whole tab). The same
 * shape as the session's own build (store/blocks.ts's blocksForBuild).
 */
export const contextFor = (tab: TabBlocks, k: number): string[] => {
  const at = tab.queries[k] ?? tab.blocks.length;
  return [
    ...tab.blocks.slice(0, at).map(b => b.text),
    ...tab.blocks
      .slice(at + 1)
      .filter(b => isValuesBlock(b.text))
      .map(b => b.text),
  ];
};

/**
 * The tab with query block `k`'s text replaced by `text`. Only that block's
 * lines change. With no query block yet, `text` is added at the end.
 */
export function replaceQuery(expression: string, tab: TabBlocks, k: number, text: string): string {
  const at = tab.queries[k];
  if (at === undefined) {
    const before = expression.replace(/\s*$/, '');
    return before ? `${before}\n\n${text}` : text;
  }
  const block = tab.blocks[at];
  const lines = expression.split('\n');
  const count = block.text.split('\n').length;
  return [
    ...lines.slice(0, block.startLine),
    ...text.split('\n'),
    ...lines.slice(block.startLine + count),
  ].join('\n');
}
