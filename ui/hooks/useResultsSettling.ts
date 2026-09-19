import { useEffect, useState } from 'react';
import { isResultsSettling, subscribeToResultsSettling } from '../styles/freeze-during-motion';

/**
 * True while the results grid is doing its post-resize settle work in the
 * background (see freeze-during-motion.ts for what that work is and why it
 * can't just be skipped). Result.tsx uses this to show a plain placeholder
 * instead of the grid itself for that one window, so the re-render happens
 * off-screen rather than visibly stuttering into view.
 */
export function useResultsSettling(): boolean {
  const [settling, setSettling] = useState(isResultsSettling);
  useEffect(() => subscribeToResultsSettling(setSettling), []);
  return settling;
}
