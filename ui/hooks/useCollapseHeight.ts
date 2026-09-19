import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Measures an element so it can be collapsed to nothing and back.
 *
 * `height: auto` is not animatable, and the surfaces this is for -- the
 * app header, the error band above Results, the reveal-request banner --
 * have no height anyone can hardcode: they wrap differently per theme,
 * text size, connection name and error message. Picking a generous
 * `maxHeight` instead is the usual shortcut and it shows: the transition
 * runs to a number far past the real height, so the visible part of the
 * motion finishes early and the rest of the duration is dead time.
 *
 * So: measure the content, animate the wrapper to that number.
 *
 * Returns a ref for the CONTENT (which keeps its natural size throughout --
 * it's never the thing being resized, or its text would rewrap the whole
 * way down) and the height to apply to the WRAPPER around it, which needs
 * `overflow: hidden`.
 *
 * The ResizeObserver keeps the measurement honest: an error message
 * arriving, a longer connection name, or a Text Size change all alter the
 * content's height while it's open, and a stale number would clip it.
 */
export function useCollapseHeight<T extends HTMLElement>(expanded: boolean) {
  const contentRef = useRef<T>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);

  // Two effects on purpose. The measurement has to re-run on every render
  // (the content can change without its element changing - a new error
  // message, a longer connection name), but the observer must NOT be torn
  // down and rebuilt each time: these live inside MobX observers that
  // re-render on ordinary session activity, which would mean churning a
  // ResizeObserver on a hot path for nothing.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (el) setContentHeight(el.getBoundingClientRect().height);
  });

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setContentHeight(el.getBoundingClientRect().height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return {
    contentRef,
    // `undefined` (not 0) until the first measurement lands, so the very
    // first paint renders at the content's natural height instead of
    // flashing collapsed -- the measurement happens in a layout effect, so
    // this only matters for the frame before it runs.
    height: expanded ? contentHeight : 0,
  };
}
