import { setUserPreference } from '../store/preferences';

export type ResizeAxis = 'x' | 'y';

export function useResizeDrag(options: {
  value: number;
  setValue: (n: number) => void;
  min: number;
  max: number | (() => number);
  storageKey: string;
  axis: ResizeAxis;
}): (e: React.MouseEvent) => void {
  const { value, setValue, min, max, storageKey, axis } = options;

  return (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.pageX;
    const startY = e.pageY;
    const startValue = value;

    const handleMouseMove = (e: MouseEvent) => {
      const effectiveMax = typeof max === 'function' ? max() : max;
      const delta = axis === 'x' ? e.pageX - startX : startY - e.pageY;
      const newValue = startValue + delta;
      const constrained = Math.min(Math.max(newValue, min), effectiveMax);
      setValue(constrained);
      setUserPreference(storageKey, constrained);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
}
