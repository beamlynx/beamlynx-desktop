import type { Theme } from '@glideapps/glide-data-grid';

/**
 * The results grid draws onto a canvas, and a canvas cannot read CSS custom
 * properties. So the app's theme tokens are read out of the live document
 * and handed to the grid as plain values. ResultsGrid re-reads them whenever
 * the theme, the code font or the text size changes.
 */

/** Row and header heights at text size 1, matching the old grid's compact density. */
export const BASE_ROW_HEIGHT = 36;
export const BASE_HEADER_HEIGHT = 40;
/** The old grid's 0.875rem, at a root font size of 16px. */
const BASE_FONT_PX = 14;

export interface ResolvedGridTheme {
  theme: Partial<Theme>;
  /** --text-scale: row height, header height and font size are multiplied by it. */
  scale: number;
  /** --canvas-trace, for the hover spotlight's top edge. */
  trace: string;
}

const read = (style: CSSStyleDeclaration, name: string, fallback: string) =>
  style.getPropertyValue(name).trim() || fallback;

/** `#rrggbb` (or `#rgb`) plus an alpha, as `rgba(...)`. Anything else comes back unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return color;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function resolveGridTheme(): ResolvedGridTheme {
  const style = getComputedStyle(document.documentElement);
  const scale = Number(read(style, '--text-scale', '1')) || 1;
  const bg = read(style, '--canvas-node-bg', '#1f2335');
  const chip = read(style, '--canvas-chip-bg', '#24283b');
  const border = read(style, '--canvas-node-border', '#363b58');
  const text = read(style, '--canvas-text', '#c0caf5');
  const dim = read(style, '--canvas-text-dim', '#787c99');
  const trace = read(style, '--canvas-trace', '#7aa2f7');
  const font = read(style, '--code-font', 'monospace');
  const fontPx = Math.round(BASE_FONT_PX * scale * 10) / 10;

  return {
    scale,
    trace,
    theme: {
      bgCell: bg,
      bgCellMedium: chip,
      bgHeader: chip,
      bgHeaderHasFocus: chip,
      bgHeaderHovered: chip,
      bgBubble: chip,
      bgBubbleSelected: chip,
      bgSearchResult: withAlpha(trace, 0.25),
      textDark: text,
      textMedium: dim,
      textLight: dim,
      textBubble: text,
      textHeader: text,
      textHeaderSelected: text,
      textGroupHeader: text,
      // Row lines at full strength, column lines at half: a result reads
      // across rows, and the column lines are only there to show where a
      // column ends (and where to drag it).
      borderColor: withAlpha(border, 0.5),
      horizontalBorderColor: border,
      drilldownBorder: border,
      accentColor: trace,
      accentFg: bg,
      accentLight: withAlpha(trace, 0.18),
      linkColor: trace,
      fontFamily: font,
      baseFontStyle: `${fontPx}px`,
      headerFontStyle: `600 ${fontPx}px`,
      editorFontSize: `${fontPx}px`,
      cellHorizontalPadding: 10,
      cellVerticalPadding: 4,
      lineHeight: 1.4,
    },
  };
}
