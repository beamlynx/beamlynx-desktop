import { useEffect, useRef, useState } from 'react';
import { MOTION, motionDuration } from '../styles/motion';

export interface PanelPresence {
  /**
   * Whether to render the panel at all. Stays true through the exit
   * transition, so there's still something on screen to animate away.
   */
  mounted: boolean;
  /**
   * What the transition reads: the panel's open/closed visual state.
   * Lags `visible` by one frame on the way in (see below) and leads it on
   * the way out.
   */
  open: boolean;
}

/**
 * Lets a conditionally-rendered panel animate out as well as in.
 *
 * The app's panels are rendered as `{someFlag && <Panel/>}`. React removes
 * the element the instant the flag flips, which is fine when showing and
 * hiding is instantaneous but leaves nothing on screen to transition once
 * it isn't. This keeps the panel mounted for the length of its exit
 * transition and only then lets it go.
 *
 * The one-frame delay on `open` is what makes the ENTER animation work at
 * all: a freshly mounted element that renders straight into its open state
 * has no previous value for the browser to interpolate from, so it just
 * appears. Rendering closed first, then flipping open on the next frame,
 * gives the transition a start and an end. Two nested rAFs, not one -- a
 * single rAF callback can still run inside the same frame the element was
 * created in, before style has been computed for it.
 *
 * Under reduced motion `exitMs` collapses to 0 (motionDuration), so the
 * panel unmounts on the next tick rather than making the user wait out a
 * duration for something that already disappeared instantly.
 */
export function usePanelPresence(visible: boolean, exitMs: number = MOTION.exit): PanelPresence {
  const [mounted, setMounted] = useState(visible);
  const [open, setOpen] = useState(visible);
  // Tracked in a ref rather than read from `mounted` in the effect below,
  // so the effect depends only on `visible` -- it must run on the flag
  // changing, not again on its own setState landing.
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelExit = () => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = null;
  };

  useEffect(() => {
    cancelExit();

    if (visible) {
      setMounted(true);
      // Next frame, not this one -- see the doc comment above.
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setOpen(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }

    setOpen(false);
    exitTimer.current = setTimeout(() => setMounted(false), motionDuration(exitMs));
    return cancelExit;
  }, [visible, exitMs]);

  return { mounted, open };
}
