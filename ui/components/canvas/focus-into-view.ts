import { ReactFlowInstance } from 'reactflow';
import { CanvasStore } from '../../store/canvas/canvas.store';
import { intoView } from '../../store/canvas/into-view';
import { Viewport } from '../../store/canvas/room-for-list';

/**
 * The view, starting from `from`, that shows the table the keyboard is on:
 * panned as little as it takes, at the same zoom (into-view.ts). Null when
 * `from` already shows it, or it isn't drawn yet.
 */
export const focusIntoView = (
  flow: ReactFlowInstance,
  canvasStore: CanvasStore,
  container: React.RefObject<HTMLDivElement>,
  from: Viewport = flow.getViewport(),
): Viewport | null => {
  const focused = canvasStore.focusedAlias;
  const node = focused ? flow.getNode(focused) : undefined;
  const box = container.current?.getBoundingClientRect();
  if (!node?.positionAbsolute || !node.width || !node.height || !box) return null;
  return intoView({
    node: { ...node.positionAbsolute, width: node.width, height: node.height },
    width: box.width,
    height: box.height,
    current: from,
  });
};
