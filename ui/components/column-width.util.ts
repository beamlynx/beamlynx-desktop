/**
 * Estimates a results-grid column's pixel width from a sample of its own
 * content, so Result.tsx can give it a fixed width instead of MUI
 * DataGrid's `flex: 1`.
 *
 * A flex column is recalculated by DataGrid across every column and every
 * visible row on every container resize - measured directly as the
 * dominant remaining cost of a panel animating next to a populated results
 * grid (worst frame 23ms with an empty grid, 102ms with 26 rows in it - see
 * this project's own history for that investigation). A fixed-width column
 * costs DataGrid nothing to resize: the container just clips or reveals
 * more of it, the same as scrolling.
 *
 * Character count is a workable proxy for pixel width here specifically
 * because the grid's own font is monospace (see Result.tsx's comment on
 * `--code-font` - tabular data gets the same font code does, for exactly
 * this kind of alignment), so it needs no canvas measurement or DOM
 * probing to estimate - arithmetic that's cheap enough to run inside a
 * memo alongside everything else Result.tsx already computes there.
 */

const PX_PER_CHAR = 8;
// Covers MUI's compact-density cell padding plus a little extra for a
// column's sort icon, which only appears on some columns - not exact for
// every monospace font a user might pick (styles/fonts.ts offers more than
// one), just close enough that a resize handle, not a wall of clipped
// text, is the normal way to adjust from here.
const PADDING = 32;

export interface EstimateColumnWidthOptions {
  min: number;
  max: number;
  /** How many rows to sample - the same trade-off columnLooksLikeJson's own sampleSize makes. */
  sampleSize?: number;
  /**
   * JSON columns are read in JsonInspectorPanel, not in the grid cell
   * itself (JsonCellContent renders a preview) - sizing the column to fit
   * one arbitrarily long blob would be sizing it for content nobody reads
   * at that width. They get a fixed mid-range width instead of a content
   * scan.
   */
  isJson?: boolean;
}

export function estimateColumnWidth(
  rows: Record<string, unknown>[],
  field: string,
  headerName: string,
  { min, max, sampleSize = 50, isJson = false }: EstimateColumnWidthOptions,
): number {
  if (isJson) return Math.round((min + max) / 2);

  let longest = headerName.length;
  const limit = Math.min(rows.length, sampleSize);
  for (let i = 0; i < limit; i++) {
    const value = rows[i]?.[field];
    if (value === null || value === undefined) continue;
    const text = typeof value === 'string' ? value : String(value);
    if (text.length > longest) longest = text.length;
  }

  const estimated = longest * PX_PER_CHAR + PADDING;
  return Math.min(Math.max(estimated, min), max);
}
