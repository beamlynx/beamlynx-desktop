/**
 * Where to move the canvas's view so the table the keyboard is on can be
 * seen (docs/canvas-mode.md, "How the canvas is used"). Moving between
 * tables with the keys walks the view along with them.
 *
 * The view only pans, by as little as it takes, and never zooms: the zoom
 * is the user's.
 *
 * Pure: the canvas reads the numbers off reactflow and applies the result.
 */
import { Rect, Viewport } from './room-for-list';

export type IntoViewInput = {
  /** The focused table or line, in the graph's own coordinates. */
  node: Rect;
  /** The visible part of the canvas, in screen pixels from its top-left. */
  width: number;
  height: number;
  current: Viewport;
};

/** The gap kept between the table and the canvas's edges. */
const PAD = 24;

/** How far to move along one axis so [start, end] sits inside [0, size]. */
const shift = (start: number, end: number, size: number): number => {
  const room = size - 2 * PAD;
  // Bigger than the canvas (a line spanning a wide graph): leave it where
  // part of it shows, else bring in its near edge.
  if (end - start > room) {
    if (start < size - PAD && end > PAD) return 0;
    return start >= size - PAD ? size - PAD - start : PAD - end;
  }
  if (start < PAD) return PAD - start;
  if (end > size - PAD) return size - PAD - end;
  return 0;
};

/** The view to move to, or null when the table is already in view. */
export const intoView = ({ node, width, height, current }: IntoViewInput): Viewport | null => {
  const z = current.zoom;
  const left = node.x * z + current.x;
  const top = node.y * z + current.y;
  const dx = shift(left, left + node.width * z, width);
  const dy = shift(top, top + node.height * z, height);
  if (dx === 0 && dy === 0) return null;
  return { x: current.x + dx, y: current.y + dy, zoom: z };
};
