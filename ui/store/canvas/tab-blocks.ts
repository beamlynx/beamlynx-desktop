// A tab as the canvas sees it: its query blocks, the last of which is the
// query the canvas draws, and the earlier ones, each ending in `|= name`, as
// nested queries of it. Values blocks can be anywhere above the last query.
// Pure text work, no network: the canvas store builds each block itself.
import { ExpressionBlock, isValuesBlock, splitExpressions } from '../blocks';

export type TabBlocks = {
  blocks: ExpressionBlock[];
  /** Indices into `blocks` of the query blocks, in order. The last is the canvas's query. */
  queries: number[];
  /** Each earlier query block's `|= name`; the last block's entry is null. */
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

/**
 * The tab split for the canvas, or null when the canvas can't draw it:
 * a query block that isn't last and doesn't end in `|= name` (nothing could
 * use its result, and it isn't the query that runs), or a values block after
 * the last query. A tab with no query block has an empty last query.
 */
export function tabBlocks(expression: string): TabBlocks | null {
  const blocks = splitExpressions(expression);
  const queries = blocks.map((b, i) => (isValuesBlock(b.text) ? -1 : i)).filter(i => i >= 0);
  if (queries.length === 0) return { blocks, queries: [], names: [] };
  if (queries[queries.length - 1] !== blocks.length - 1) return null;
  const names = queries.map((q, k) =>
    k === queries.length - 1 ? null : blockName(blocks[q].text),
  );
  if (names.slice(0, -1).some(n => n === null)) return null;
  return { blocks, queries, names };
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
