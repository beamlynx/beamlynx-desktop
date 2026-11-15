/**
 * Where to move the canvas's view so a list opened from the bar doesn't
 * cover the graph (docs/canvas-mode.md, "How the canvas is used"). The list
 * rises from the bar at the bottom, at its full height. The graph moves up
 * into the space above it, and zooms out when it doesn't fit there.
 *
 * Pure: the canvas (Canvas.tsx) reads the numbers off reactflow and the
 * window, and applies the result.
 */

export type Viewport = { x: number; y: number; zoom: number };
export type Rect = { x: number; y: number; width: number; height: number };

export type RoomInput = {
  /** Every node's bounds, in the graph's own coordinates. */
  graph: Rect;
  /** The table or line the list is about, in the graph's coordinates. Kept in view when the whole graph can't be. */
  focus: Rect | null;
  /** The canvas's width, in screen pixels. */
  width: number;
  /** How far down the canvas the space above the list ends, in screen pixels from the canvas's top. */
  freeBottom: number;
  current: Viewport;
  minZoom: number;
};

/** The gap kept between the graph and the list, and the canvas's edges. */
const PAD = 16;

const toScreen = (r: Rect, v: Viewport) => ({
  left: r.x * v.zoom + v.x,
  top: r.y * v.zoom + v.y,
  right: (r.x + r.width) * v.zoom + v.x,
  bottom: (r.y + r.height) * v.zoom + v.y,
});

/**
 * The view to move to, or null when the graph already clears the list.
 *
 * - The graph fits above the list at the current zoom: it only moves up,
 *   just far enough.
 * - It doesn't: it zooms out until it fits, and is centred in the space.
 *   Never past `minZoom`, and never zoomed in.
 * - It doesn't fit even at `minZoom`: it zooms out to `minZoom`, and the
 *   table the list is about moves to just above the list.
 */
export const roomForList = ({ graph, focus, width, freeBottom, current, minZoom }: RoomInput): Viewport | null => {
  const free = { top: PAD, bottom: freeBottom - PAD, left: PAD, right: width - PAD };
  const availH = free.bottom - free.top;
  const availW = free.right - free.left;
  if (availH <= 0 || availW <= 0) return null;
  const now = toScreen(graph, current);
  if (now.bottom <= free.bottom) return null;

  const height = graph.height * current.zoom;
  if (height <= availH) return { ...current, y: current.y + (free.bottom - now.bottom) };

  const fit = Math.min(availW / graph.width, availH / graph.height);
  if (fit >= minZoom) {
    const zoom = Math.min(current.zoom, fit);
    return {
      zoom,
      x: free.left + (availW - graph.width * zoom) / 2 - graph.x * zoom,
      y: free.top + (availH - graph.height * zoom) / 2 - graph.y * zoom,
    };
  }

  if (!focus) return null;
  // As far out as it goes, to show as much as it can, with the table the
  // list is about just above the list: its bottom, unless it is taller
  // than the space. It stays where it was across, unless that is off screen.
  const zoom = Math.min(current.zoom, minZoom);
  const at = toScreen(focus, current);
  const centre = (at.left + at.right) / 2;
  const across = centre < 0 || centre > width ? width / 2 : centre;
  const bottom = free.bottom - (focus.y + focus.height) * zoom;
  const top = free.top - focus.y * zoom;
  return { zoom, x: across - (focus.x + focus.width / 2) * zoom, y: Math.max(bottom, top) };
};
