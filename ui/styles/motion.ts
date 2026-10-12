/**
 * The app's motion vocabulary - every transition duration and easing curve
 * in one place, so "how long should this take?" is a lookup rather than a
 * per-component guess. Before this file there were at least six different
 * hand-picked durations across the codebase (0.1s, 120ms, 0.15s, 0.2s,
 * 0.3s), which is what made panels feel like separate pieces of software
 * rather than one application.
 *
 * Five values, deliberately. A finer scale just invites the same guessing
 * one level down.
 *
 * These are read from BOTH sides:
 *  - CSS, as `var(--motion-enter)` etc. - emitted into `:root` by
 *    styles/theme.ts alongside the color tokens (see MOTION_CSS_VARS).
 *  - TypeScript, for the places a transition's *end* has to be waited for
 *    in JS rather than declared in CSS: NewLayoutView's canvas re-fit and
 *    usePanelPresence's deferred unmount.
 * One source, so the two can't drift.
 */
export const MOTION = {
  /** Hover, color and opacity feedback on a single control. */
  fast: 120,
  /** A panel appearing; the layout moving to make room for it. */
  enter: 200,
  /**
   * A panel leaving. Shorter than `enter` on purpose - something getting
   * out of your way should not make you wait for it, while something
   * arriving needs long enough to be followed.
   */
  exit: 150,
  /** Decelerate: quick off the mark, soft landing. For things arriving. */
  easeEnter: 'cubic-bezier(0.2, 0, 0, 1)',
  /** Accelerate: eases away rather than braking. For things leaving. */
  easeExit: 'cubic-bezier(0.4, 0, 1, 1)',
} as const;

export const MOTION_CSS_VARS = {
  '--motion-fast': `${MOTION.fast}ms`,
  '--motion-enter': `${MOTION.enter}ms`,
  '--motion-exit': `${MOTION.exit}ms`,
  '--motion-ease-enter': MOTION.easeEnter,
  '--motion-ease-exit': MOTION.easeExit,
} as const;

export const motionCssVariables = (): string =>
  Object.entries(MOTION_CSS_VARS)
    .map(([key, value]) => `${key}: ${value};`)
    .join('');

/**
 * Whether the OS asks for reduced motion.
 *
 * globals.css already flattens every CSS transition/animation under the
 * same media query, so this is only for the two things a stylesheet can't
 * reach: MUI's transitions (Drawer/Modal animate via inline styles, not
 * classes, so CSS rules never touch them) and our own JS-side delays
 * (usePanelPresence's deferred unmount, NewLayoutView's re-fit timer) -
 * without this those would still make a reduced-motion user wait out a
 * duration for something that already finished instantly.
 *
 * Returns false on the server. `matchMedia` doesn't exist there and
 * createAppTheme runs during render, so an unguarded call would crash SSR;
 * false is also the right hydration baseline, since the client's first
 * render has to produce the same markup the server did. AppView's own
 * `mounted` gate is what lets the real value take effect a tick later
 * (the same pattern getUserPreference and its callers already use for
 * localStorage).
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/** Convenience for the JS-side delays: collapses to 0 under reduced motion. */
export const motionDuration = (ms: number): number => (prefersReducedMotion() ? 0 : ms);
