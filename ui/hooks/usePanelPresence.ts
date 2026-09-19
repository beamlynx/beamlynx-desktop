import { RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { freezeResultsDuringMotion } from '../styles/freeze-during-motion';
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
  // Only Settings and the Pine/SQL panel actually need the results grid
  // protected while THEY move (see freeze-during-motion.ts) - true by
  // default keeps their existing call sites unchanged. Anything else built
  // on this hook, including a panel that exists BECAUSE of that freeze
  // cycle (Result.tsx's own settling placeholder), must opt out: freezing
  // is not a generic side effect of "something is animating in or out",
  // and baking it in unconditionally here is what caused the placeholder
  // itself to call freezeResultsDuringMotion on its own entrance, restart
  // a fresh freeze cycle, and so keep `settling` true forever - confirmed
  // live, opacity traced pinned at 1 with no further transitions.
  freezeResults: boolean = true,
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

    // Closing starts here (opening starts in the layout effect below, once
    // the panel has actually been built).
    if (freezeResults) freezeResultsDuringMotion(exitMs);
    setOpen(false);
    exitTimer.current = setTimeout(() => setMounted(false), motionDuration(exitMs));
    return cancelExit;
  }, [visible, exitMs, freezeResults]);

  // Layout effect, not a plain one: this has to run right after the closed
  // state lands in the DOM, before the browser paints it.
  useLayoutEffect(() => {
    if (!visible || !mounted || open) return;
    // Reading geometry forces a synchronous style + layout flush, which is
    // what gives the transition something to start from. The value is
    // deliberately unused.
    ref.current?.getBoundingClientRect();
    // ...and the flip waits one more frame, rather than happening right
    // here. Mounting a panel is the single most expensive thing that
    // happens on opening one (Settings' content costs tens of
    // milliseconds), and the layout flush above pays for all of it at
    // once. Starting the transition in that same frame means it begins
    // life already behind: the browser advances a transition by wall
    // clock, so the first stretch of the animation elapses while the main
    // thread is still busy and is never drawn -- the panel appears to jump
    // in partly open, which is the jitter this whole pass is about.
    // Letting that frame finish first costs about 16ms nobody can see and
    // buys an animation that starts from a standing start.
    const frame = requestAnimationFrame(() => {
      // Pin the results grid before the width starts moving, not after --
      // see styles/freeze-during-motion.ts.
      if (freezeResults) freezeResultsDuringMotion(MOTION.enter);
      setOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, mounted, open, freezeResults]);

  return { mounted, open, ref };
}
