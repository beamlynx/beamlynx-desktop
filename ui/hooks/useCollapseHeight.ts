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

  // Only ever re-renders when the HEIGHT actually changed, and only on a
  // whole pixel. This matters much more than it looks: these are full-width
  // rows, so every frame of a *sibling* panel's opening animation resizes
  // them too and fires the observer below. Without this guard that was a
  // React re-render of the whole header on all eleven frames of a 200ms
  // animation. Rounded because getBoundingClientRect returns subpixel
  // floats that jiggle without anything really changing.
  const lastHeight = useRef<number | undefined>(undefined);
  const apply = (next: number) => {
    const rounded = Math.round(next);
    if (rounded === lastHeight.current) return;
    lastHeight.current = rounded;
    setContentHeight(rounded);
  };

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    // The one measurement that has to read the DOM directly -- there's no
    // observer entry to read from yet.
    apply(el.getBoundingClientRect().height);

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      // The entry's OWN size, never a fresh getBoundingClientRect(). Reading
      // geometry inside a resize callback forces a synchronous layout, and
      // with three of these hooks live at once that meant three forced
      // layouts on every frame of any panel animation -- textbook layout
      // thrashing, and measurably the jitter it was supposed to prevent.
      // borderBoxSize, not contentRect: the wrapper animates to the
      // content's full outer height, borders included.
      apply(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
    // Mount only. The observer covers every later change -- a longer error
    // message, a wrapped connection name, a Text Size change -- so there's
    // no reason to re-read on each render, and doing so put a forced layout
    // on a path MobX re-renders constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
