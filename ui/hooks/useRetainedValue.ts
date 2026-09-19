import { useRef } from 'react';

/**
 * Remembers the last non-empty value it was given.
 *
 * For dialogs whose `open` is derived from data rather than from a boolean
 * flag -- `open={Boolean(pending)}`, `open={!!updateData}`. Those used to
 * unmount in the same frame the data was cleared, so nothing ever rendered
 * against the empty value. Now that they animate out (ModalSurface's
 * `closeAfterTransition`), the body keeps rendering for the length of the
 * exit, with its data already gone: the connection-switch warning spent its
 * whole fade-out reading "may not work on" followed by a blank name.
 *
 * Holding the last value keeps the dialog showing what it was about while
 * it leaves. The retained value is deliberately never cleared - the next
 * open overwrites it, and nothing reads it while the dialog is closed.
 */
export function useRetainedValue<T>(value: T | null | undefined): T | null {
  const retained = useRef<T | null>(null);
  if (value !== null && value !== undefined) retained.current = value;
  return retained.current;
}
