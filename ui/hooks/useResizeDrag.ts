import { setUserPreference } from '../store/preferences';

export type ResizeAxis = 'x' | 'y';

export function useResizeDrag(options: {
  value: number;
  setValue: (n: number) => void;
  min: number;
  max: number | (() => number);
  storageKey: string;
  axis: ResizeAxis;
  // Most dividers resize a box that sits before them in DOM order (a
  // left/top pane growing away from its fixed edge), so a positive delta
  // (dragging right, or up for the 'y' bottom-panel convention) grows it.
  // When the resizable box instead sits after the divider (its fixed edge
  // is on the far side from where it grows), that same drag direction
  // shrinks it - set invert to flip the sign for those cases.
  invert?: boolean;
}): (e: React.MouseEvent) => void {
  const { value, setValue, min, max, storageKey, axis, invert = false } = options;

  return (e: React.MouseEvent) => {
    e.preventDefault();
    // Panels transition their width/height when they open and close. This
    // sets that same dimension on every mousemove, so the transition has to
    // be off for the duration of the drag or the panel rubber-bands behind
    // the cursor instead of tracking it. globals.css turns it off for
    // anything carrying data-panel-motion while this class is present (and
    // suppresses text selection, which dragging used to trigger on whatever
    // the cursor passed over).
    document.body.classList.add('is-resizing');
    const startX = e.pageX;
    const startY = e.pageY;
    const startValue = value;

    // The size is set once per frame, however many mousemoves arrive in it,
    // and saved once, on release: saving writes to storage (on the desktop,
    // the app's database), which it did on every mousemove.
    let latest: number | null = null;
    let frame = 0;
    const apply = () => {
      frame = 0;
      if (latest !== null) setValue(latest);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const effectiveMax = typeof max === 'function' ? max() : max;
      const rawDelta = axis === 'x' ? e.pageX - startX : startY - e.pageY;
      const delta = invert ? -rawDelta : rawDelta;
      const newValue = startValue + delta;
      latest = Math.min(Math.max(newValue, min), effectiveMax);
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const handleMouseUp = () => {
      if (frame) cancelAnimationFrame(frame);
      apply();
      if (latest !== null) setUserPreference(storageKey, latest);
      document.body.classList.remove('is-resizing');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
}
