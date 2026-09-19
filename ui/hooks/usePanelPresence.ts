import { RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MOTION, motionDuration } from '../styles/motion';

export interface PanelPresence<T extends HTMLElement> {
  /**
   * Whether to render the panel at all. Stays true through the exit
   * transition, so there's still something on screen to animate away.
   */
  mounted: boolean;
  /**
   * What the transition reads: the panel's open/closed visual state.
   * Lags `visible` by one commit on the way in (see below) and leads it on
   * the way out.
   */
  open: boolean;
  /**
   * Must be attached to the element that actually animates. It isn't
   * optional -- see the layout effect below for what it's for.
   */
  ref: RefObject<T>;
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
 * ENTERING is the fiddly half, and the reason for the ref. A CSS transition
 * only runs when the browser has a previous computed value to interpolate
 * FROM: an element that is created and lands in its open state in the same
 * style recalculation just appears, with no animation at all. So the panel
 * is rendered closed first, and only flipped open once the browser has
 * actually computed that closed state -- which is what reading the ref's
 * geometry below forces it to do.
 *
 * A pair of requestAnimationFrames was the first attempt at that and is not
 * enough in practice: Settings' own first render is heavy (ConnectionsSection
 * alone is over a thousand lines), and it blocks the main thread long enough
 * that both frames can be serviced before the closed state is ever
 * committed. Measured, not guessed -- the panel jumped straight to its full
 * width while closing animated correctly. Forcing the flush is what makes
 * this deterministic regardless of how slow the panel's contents are.
 *
 * A panel that is already visible on the very first render (a persisted
 * preference, say) starts open with no animation, which is right: the app
 * should not play its panels in on load.
 *
 * Under reduced motion `exitMs` collapses to 0 (motionDuration), so the
 * panel unmounts on the next tick rather than making the user wait out a
 * duration for something that already disappeared instantly.
 */
export function usePanelPresence<T extends HTMLElement = HTMLDivElement>(
  visible: boolean,
  exitMs: number = MOTION.exit,
): PanelPresence<T> {
  const ref = useRef<T>(null);
  const [mounted, setMounted] = useState(visible);
  const [open, setOpen] = useState(visible);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelExit = () => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = null;
  };

  useEffect(() => {
    cancelExit();

    if (visible) {
      setMounted(true);
      return;
    }

    setOpen(false);
    exitTimer.current = setTimeout(() => setMounted(false), motionDuration(exitMs));
    return cancelExit;
  }, [visible, exitMs]);

  // Layout effect, not a plain one: this has to run after the closed state
  // is in the DOM but before the browser paints, so the open state lands in
  // the very next style recalculation rather than a frame later.
  useLayoutEffect(() => {
    if (!visible || !mounted || open) return;
    // Reading geometry forces a synchronous style + layout flush, which is
    // what gives the transition below something to start from. The value is
    // deliberately unused.
    ref.current?.getBoundingClientRect();
    setOpen(true);
  }, [visible, mounted, open]);

  return { mounted, open, ref };
}
