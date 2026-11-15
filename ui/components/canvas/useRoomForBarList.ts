import { useCallback, useEffect, useRef } from 'react';
import { ReactFlowInstance, getRectOfNodes } from 'reactflow';
import { CanvasStore } from '../../store/canvas/canvas.store';
import { PickerAnchor } from '../../store/canvas/canvas.model';
import { Viewport, roomForList } from '../../store/canvas/room-for-list';
import { barListTop } from './Picker';
import { focusIntoView } from './focus-into-view';

/**
 * A list opened from the bar rises over the bottom of the canvas. While it
 * is open, the graph moves up above it, zoomed out if it doesn't fit there
 * (room-for-list.ts). When the list closes, the view goes back to where it
 * was.
 *
 * The view is the user's: if they pan or zoom while the list is open, theirs
 * stays when it closes.
 *
 * Returns `makeRoom`, which the canvas calls in place of its usual fit when
 * the graph changes under an open list (a pick in select, which stays open).
 */
export const useRoomForBarList = (
  canvasStore: CanvasStore,
  flow: ReactFlowInstance,
  container: React.RefObject<HTMLDivElement>,
  minZoom: number,
) => {
  const picker = canvasStore.picker;
  const anchor: PickerAnchor | null = picker.open && picker.anchor.centered ? picker.anchor : null;
  const open = anchor !== null;

  // The view from before the list opened, and the node count then.
  const saved = useRef<{ viewport: Viewport; nodes: number } | null>(null);
  // The user panned or zoomed while the list was open.
  const userMoved = useRef(false);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;

  const makeRoom = useCallback(
    (duration = 200) => {
      const at = anchorRef.current;
      const box = container.current?.getBoundingClientRect();
      const nodes = flow.getNodes().filter(n => n.width && n.height && n.className !== 'canvas-exiting');
      if (!at || !box || nodes.length === 0) return;
      const focusId = canvasStore.focusedAlias ?? canvasStore.operationAnchor;
      const node = focusId ? flow.getNode(focusId) : undefined;
      const focus =
        node?.positionAbsolute && node.width && node.height
          ? { ...node.positionAbsolute, width: node.width, height: node.height }
          : null;
      const next = roomForList({
        graph: getRectOfNodes(nodes),
        focus,
        width: box.width,
        freeBottom: barListTop(at) - box.top,
        current: flow.getViewport(),
        minZoom,
      });
      if (next) flow.setViewport(next, { duration });
    },
    [canvasStore, flow, container, minZoom],
  );

  useEffect(() => {
    if (open) {
      if (!saved.current) {
        saved.current = { viewport: flow.getViewport(), nodes: flow.getNodes().length };
        userMoved.current = false;
      }
      makeRoom();
      return;
    }
    if (!saved.current) return;
    // Going straight from one bar list to the next keeps the view: wait a
    // moment before giving it back.
    const t = setTimeout(() => {
      const before = saved.current;
      saved.current = null;
      if (!before || userMoved.current) return;
      // A pick that added a table refits the view, as any new table does,
      // unless the view is one the user moved to: then it comes back, with
      // the new table panned into it.
      if (flow.getNodes().length === before.nodes) flow.setViewport(before.viewport, { duration: 200 });
      else if (!canvasStore.userView) flow.fitView({ duration: 200 });
      else {
        const next = focusIntoView(flow, canvasStore, container, before.viewport) ?? before.viewport;
        flow.setViewport(next, { duration: 200 });
      }
    }, 80);
    return () => clearTimeout(t);
    // The anchor moves when the bar unfolds into rows.
  }, [open, anchor?.y, makeRoom, flow, canvasStore, container]);

  /** For ReactFlow's onMoveStart: a move with an event is the user's own. */
  const onMoveStart = useCallback((event: unknown) => {
    if (event && saved.current) userMoved.current = true;
  }, []);

  return { listOpen: open, makeRoom, onMoveStart };
};
