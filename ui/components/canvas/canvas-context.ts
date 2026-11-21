import { createContext, useContext } from 'react';
import { CanvasStore } from '../../store/canvas/canvas.store';

// Canvas mode's store is created per-mount in Canvas.tsx (see the component
// for why: it deliberately isn't attached to Session/GlobalStore, so this
// experiment adds nothing to either class - see the plan doc's file list).
// Every node/picker component below <Canvas> reads it from here instead of
// threading it through NodeProps, which ReactFlow's nodeTypes registry
// doesn't have a slot for.
export const CanvasStoreContext = createContext<CanvasStore | null>(null);

export const useCanvasStore = (): CanvasStore => {
  const store = useContext(CanvasStoreContext);
  if (!store) throw new Error('useCanvasStore must be used within <CanvasStoreContext.Provider>');
  return store;
};
