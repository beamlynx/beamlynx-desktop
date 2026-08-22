import { useEffect } from 'react';
import { CanvasStore } from '../store/canvas/canvas.store';
import { Session } from '../store/session';
import { GlobalStore } from '../store/global.store';
import { CanvasTableNodeData, START_NODE_ID } from '../store/canvas/canvas.model';

interface CanvasKeybindingsProps {
  canvasStore: CanvasStore;
  session: Session;
  global: GlobalStore;
}

/**
 * The modal (vim-style) keyboard layer for canvas mode: normal-mode
 * navigation (hjkl/arrows) and single-letter operation shortcuts on
 * whichever node currently has keyboard focus (CanvasStore.focusedAlias).
 *
 * Mirrors useGlobalKeybindings.ts's structure (a single document-level
 * `keydown` listener) but is deliberately its own hook rather than an
 * addition to that registry - these bindings are single, bare letters
 * (`s`, `w`, `o`, ...), which only make sense to interpret while canvas mode
 * is the active view and nothing else on the page wants keystrokes. Folding
 * that guard into the shared KEYBINDINGS registry (built for modifier-key
 * combos like Ctrl+K) would mean threading canvas-specific state through a
 * registry every *other* consumer has nothing to do with.
 *
 * `mode` (CanvasStore's own getter, derived from `picker.open`) gates
 * everything below: while a picker is open, Picker.tsx's own listeners
 * (ArrowUp/Down/Tab/Enter on its filter input, Escape globally) already own
 * the keyboard, and this hook is a strict no-op.
 */
export const useCanvasKeybindings = ({ canvasStore, session, global }: CanvasKeybindingsProps) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!global.canvasActive) return;

      // The Pine/SQL editors are CodeMirror 6, which renders `contenteditable`
      // divs, not `<input>`/`<textarea>` - `session.textInputFocused` is the
      // flag those editors themselves maintain on focus/blur (see
      // PineInput.tsx/SqlInput.tsx), and useGlobalKeybindings already relies
      // on it for the same reason. The tag/contenteditable check below is a
      // belt-and-suspenders net for anything else with a real text input
      // (the picker's own filter box, MultiSelectToolbar's limit input).
      if (session.textInputFocused) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;

      // A picker is open (insert mode) - its own keydown handlers
      // (Picker.tsx's onListKeyDown and window-level Escape listener) keep
      // exclusive control of the keyboard while it's up.
      if (canvasStore.mode !== 'normal') return;

      const alias = canvasStore.focusedAlias;
      const isStart = alias === START_NODE_ID;
      // A frame/checkpoint node is a valid focus target (CanvasStore.
      // orderedFocusTargets interleaves it by memberOrder) but its
      // operations go through openCheckpointPicker, not openColumnPicker/
      // openJoinPicker directly - see FrameNode.tsx's own action bar, which
      // calls the same store method.
      const isFrame = canvasStore.canvasGraph.nodes.find(n => n.id === alias)?.type === 'frame-node';

      // Synthesized anchor: there's no click event to read a position from
      // when a picker is opened by keyboard - use the focused node's own
      // rendered position instead (both TableNode.tsx and StartNode.tsx tag
      // their root with this same test id).
      const anchorFor = (targetAlias: string): { x: number; y: number } => {
        const el = document.querySelector(`[data-testid="canvas-node-${targetAlias}"]`);
        if (!el) return { x: 24, y: 24 };
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      };

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          canvasStore.focusNext();
          return;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          canvasStore.focusPrev();
          return;
        // ArrowLeft/h, ArrowRight/l: reserved. There's no second navigation
        // axis today (data.order is a single, strictly sequential list) -
        // see the plan doc's "Explicitly out of scope".
        // `|` is Pine's own pipe operator - a join is "pipe a new table onto
        // this one", so it doubles as a second, mnemonic way to trigger the
        // exact same action as `i` below (not a different one).
        case 'i':
        case '|':
          e.preventDefault();
          if (isStart) {
            canvasStore.openTablePicker(anchorFor(alias));
          } else if (isFrame) {
            void canvasStore.openCheckpointPicker('join', anchorFor(alias));
          } else {
            canvasStore.openJoinPicker(alias, anchorFor(alias));
          }
          return;
        case 's':
          if (isStart) return;
          e.preventDefault();
          if (isFrame) void canvasStore.openCheckpointPicker('select', anchorFor(alias));
          else canvasStore.openColumnPicker('select', alias, anchorFor(alias));
          return;
        case 'w':
          if (isStart) return;
          e.preventDefault();
          if (isFrame) void canvasStore.openCheckpointPicker('where', anchorFor(alias));
          else canvasStore.openColumnPicker('where', alias, anchorFor(alias));
          return;
        case 'o':
          if (isStart) return;
          e.preventDefault();
          if (isFrame) void canvasStore.openCheckpointPicker('order', anchorFor(alias));
          else canvasStore.openColumnPicker('order', alias, anchorFor(alias));
          return;
        case 'g':
          // Not offered for a checkpoint's own sealed output - grouping an
          // already-grouped result is a different semantic question,
          // deliberately left unimplemented (see FrameNode.tsx's own doc
          // comment on `openAction`'s kind union, which excludes 'group').
          if (isStart || isFrame) return;
          e.preventDefault();
          canvasStore.openColumnPicker('group', alias, anchorFor(alias));
          return;
        case 'x': {
          if (isStart) return;
          if (isFrame) {
            // Cancels the container itself - removes the whole
            // group:/limit:/name run, leaving its member tables as plain
            // nodes again (canvasStore.deleteCheckpoint, mirroring
            // deleteNode below for a single table). Not the same as
            // removing one of the tables it wraps, which stays a per-table
            // gesture (canvas.model.ts's `removable` comment).
            e.preventDefault();
            void canvasStore.deleteCheckpoint(alias);
            return;
          }
          // `node.type` isn't a literal-discriminated field on reactflow's
          // `Node<T>` - see layout.ts's getNodeHeight comment - hence the
          // explicit cast rather than relying on narrowing.
          const node = canvasStore.canvasGraph.nodes.find(n => n.type === 'table-node' && n.id === alias);
          if (node && (node.data as CanvasTableNodeData).removable) {
            e.preventDefault();
            void canvasStore.deleteNode(alias);
          }
          return;
        }
        // `e.key` is 'U' (not 'u' + shiftKey) when Shift is held - both
        // cases land here. Plain `u` undoes; Shift+U redoes. Not Ctrl+R
        // (vim's own redo combo): that's the browser's reload shortcut, and
        // utils/keybindings.ts already documents this exact class of
        // collision (Ctrl+T/Ctrl+W/Ctrl+K are similarly unavailable in the
        // browser build) and picks browser-safe alternates instead of
        // fighting the host chrome. Shift+U pairs visibly with plain `u`
        // without touching a combo a real browser tab would intercept.
        case 'u':
          if (canvasStore.canUndo) {
            e.preventDefault();
            canvasStore.undo();
          }
          return;
        case 'U':
          if (canvasStore.canRedo) {
            e.preventDefault();
            canvasStore.redo();
          }
          return;
        // ':' reserved - future canvas<->text-mode toggle hook point, not
        // wired in this pass (see the plan doc's "Explicitly out of scope").
        default:
          return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [canvasStore, session, global]);
};
