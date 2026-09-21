import { useEffect, useState } from 'react';
import { getUserPreference } from '../store/preferences';

/**
 * A size read from a saved preference, plus whether it has been applied yet.
 *
 * The preference lives in localStorage, which a prerendered page cannot read
 * while rendering -- so it arrives one commit late, from an effect. That is
 * fine for the value and wrong for anything animating it: the element renders
 * at the default, then changes to the saved size, and a CSS transition on that
 * property dutifully animates between the two.
 *
 * Which is why `ready` exists. It is false for exactly the render where the
 * size is still the default, so a caller can hold its transition off until the
 * real value has landed.
 *
 * The visible symptom, before this: MUI's TabPanel unmounts an inactive tab's
 * children, so every tab switch remounts the pane -- and the Pine panel played
 * its whole width animation each time, for no reason anyone could point at. It
 * was not opening; it was travelling from the default width to the saved one.
 */
export function usePersistedSize(key: string, fallback: number) {
  const [size, setSize] = useState(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSize(getUserPreference(key, fallback));
    setReady(true);
    // Read once on mount, like every other preference here. A later write goes
    // through setSize from the divider being dragged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { size, setSize, ready };
}
