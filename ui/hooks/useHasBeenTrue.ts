import { useRef } from 'react';

/**
 * Whether `value` has been true on any render so far. For something loaded
 * the first time it is shown, and kept afterwards so it can animate closed.
 */
export function useHasBeenTrue(value: boolean): boolean {
  const seen = useRef(false);
  if (value) seen.current = true;
  return seen.current;
}
