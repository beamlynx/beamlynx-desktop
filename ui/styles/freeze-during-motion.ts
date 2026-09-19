import { MOTION, prefersReducedMotion } from './motion';

/**
 * Holds the results grid's width still for the length of a panel animation,
 * and exposes when the grid is doing its one unavoidable resize
 * recalculation afterward, so Result.tsx can mask it behind a placeholder
 * instead of letting it stutter into view.
 *
 * The results grid is by far the most expensive thing on screen to resize.
 * A panel opening next to it used to change its container's width on every
 * frame, and even with fixed-width columns (not `flex: 1` any more - see
 * column-width.util.ts) MUI DataGrid still re-renders every visible cell
 * through React once its container settles at a new size, to work out
 * which columns are now on/off screen. Measured directly (Chrome trace,
 * sampled CPU profile, not just frame timing): that settle costs real
 * chunks of main-thread time - individual bursts of 10-40ms - regardless of
 * table colors, hovering, or column editability, all tested and ruled out
 * as the cause. It is not native layout or paint (each totalled under 30ms
 * across a whole capture); it is React reconciling GridCell/GridRow.
 *
 * So the pane's width is pinned to what it already had for the length of
 * the animation and simply clipped by its wrapper (which already has
 * `overflow: hidden`) - the grid sees no resize at all until released, so
 * the recalculation happens once instead of on every frame. That release
 * is also, deliberately, when `settling` turns true: the grid keeps doing
 * its real re-render in the background (still mounted, not torn down),
 * but Result.tsx paints a plain placeholder over it in the meantime rather
 * than the actual re-render, which - unlike the grid's own content - costs
 * nothing to redraw and so cannot itself stutter. `settling` turns false
 * only once the grid has had a real window to finish, not the instant the
 * pane's own width transition ends.
 *
 * Done with a plain module-level subscriber list rather than a MobX
 * observable or similar, so this file stays framework-agnostic (it already
 * touches the DOM directly, for the same reason) and any component can
 * subscribe without pulling in the store.
 *
 * Overlapping animations are counted rather than assumed away: toggling two
 * panels in quick succession would otherwise let the first one's timer
 * release the pane (and end settling) while the second is still running.
 */
let activeFreezes = 0;
let frozen: { el: HTMLElement; flex: string }[] = [];
let settling = false;
let settlingListeners: Array<(value: boolean) => void> = [];
// Bumped each time a fresh freeze cycle starts (activeFreezes 0 -> 1). Lets
// a cycle's own delayed "turn settling off" callback recognize that a NEWER
// cycle has since started (rapid toggling) and skip itself, rather than
// switching settling off out from under an animation it doesn't belong to.
let settleCycle = 0;

const release = () => {
  for (const { el, flex } of frozen) el.style.flex = flex;
  frozen = [];
};

const setSettling = (value: boolean) => {
  if (settling === value) return;
  settling = value;
  settlingListeners.forEach(listener => listener(value));
};

/** Current value, for a subscriber's own initial state. */
export function isResultsSettling(): boolean {
  return settling;
}

/** Notified whenever `isResultsSettling()`'s value changes. Returns an unsubscribe function. */
export function subscribeToResultsSettling(listener: (value: boolean) => void): () => void {
  settlingListeners.push(listener);
  return () => {
    settlingListeners = settlingListeners.filter(l => l !== listener);
  };
}

// How long past the pane's own release to keep the placeholder up, on top
// of durationMs itself. Measured directly rather than guessed: DataGrid's
// own re-render burst ran up to ~400ms of wall-clock time (in scattered
// sub-40ms chunks, not one block) after a release in the traced repro.
// Generous on purpose - revealing a little late is invisible, revealing
// early exposes exactly the stutter this exists to hide.
const SETTLE_REVEAL_BUFFER_MS = 450;

export function freezeResultsDuringMotion(durationMs: number = MOTION.enter): void {
  if (typeof document === 'undefined') return;
  // Nothing is animating, so there is nothing to protect the grid from -
  // and nothing to mask, so settling never needs to turn on.
  if (prefersReducedMotion()) return;

  if (activeFreezes === 0) {
    setSettling(true);
    settleCycle += 1;
    document.querySelectorAll<HTMLElement>('[data-results-pane]').forEach(el => {
      const width = el.getBoundingClientRect().width;
      // A pane with no width yet (a tab that has never been shown) has
      // nothing worth pinning, and pinning it to 0 would collapse it.
      if (width <= 0) return;
      frozen.push({ el, flex: el.style.flex });
      el.style.flex = `0 0 ${Math.round(width)}px`;
    });
  }
  const cycle = settleCycle;

  activeFreezes += 1;
  // A little past the transition, so the release lands after the layout has
  // actually settled rather than racing the last frame of it.
  window.setTimeout(() => {
    activeFreezes -= 1;
    if (activeFreezes > 0) return;
    release();
    // The placeholder stays up past the release itself - see
    // SETTLE_REVEAL_BUFFER_MS's own comment for why the extra time is real,
    // not padding for its own sake. Guarded by `cycle`: if a second toggle
    // started a fresh freeze while this one's buffer was still counting
    // down, THAT cycle owns turning settling off, not this stale callback.
    window.setTimeout(() => {
      if (settleCycle === cycle) setSettling(false);
    }, SETTLE_REVEAL_BUFFER_MS);
  }, durationMs + 48);
}
