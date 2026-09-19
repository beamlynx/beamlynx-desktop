import { MOTION, prefersReducedMotion } from './motion';

/**
 * Holds the results grid's width still for the length of a panel animation.
 *
 * The results grid is by far the most expensive thing on screen to resize.
 * Its columns are `flex: 1` (see plugin/default.plugin.tsx), so every change
 * of container width recomputes every column and re-renders every visible
 * cell -- measured at 80-100ms with only 26 rows on screen. A panel opening
 * next to it changes that width on every frame, so the grid did that work
 * three or four times mid-animation and the animation visibly froze each
 * time. With an empty grid none of this shows up, which is why it survived
 * the first round of this work: worst frame 23ms empty, 102ms with rows in
 * it.
 *
 * So for the length of the animation the pane is pinned to the width it
 * already had and simply clipped by its wrapper (which already has
 * `overflow: hidden`). The grid sees no resize at all, and does its one
 * recalculation when the pane is released at the end -- by which point the
 * movement is over and a single long frame doesn't read as stutter.
 *
 * Done by touching the DOM directly rather than through React state on
 * purpose. Anything that re-renders here re-renders the grid, with all its
 * rows, which is the exact cost being avoided -- and it would land at the
 * worst possible moment, the first frame of the animation.
 *
 * Overlapping animations are counted rather than assumed away: toggling two
 * panels in quick succession would otherwise let the first one's timer
 * release the pane while the second is still running.
 */
let activeFreezes = 0;
let frozen: { el: HTMLElement; flex: string }[] = [];

const release = () => {
  for (const { el, flex } of frozen) el.style.flex = flex;
  frozen = [];
};

export function freezeResultsDuringMotion(durationMs: number = MOTION.enter): void {
  if (typeof document === 'undefined') return;
  // Nothing is animating, so there is nothing to protect the grid from.
  if (prefersReducedMotion()) return;

  if (activeFreezes === 0) {
    document.querySelectorAll<HTMLElement>('[data-results-pane]').forEach(el => {
      const width = el.getBoundingClientRect().width;
      // A pane with no width yet (a tab that has never been shown) has
      // nothing worth pinning, and pinning it to 0 would collapse it.
      if (width <= 0) return;
      frozen.push({ el, flex: el.style.flex });
      el.style.flex = `0 0 ${Math.round(width)}px`;
    });
  }

  activeFreezes += 1;
  // A little past the transition, so the release lands after the layout has
  // actually settled rather than racing the last frame of it.
  window.setTimeout(() => {
    activeFreezes -= 1;
    if (activeFreezes === 0) release();
  }, durationMs + 48);
}
