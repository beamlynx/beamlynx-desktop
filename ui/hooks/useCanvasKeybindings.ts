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
 * The bare-key keyboard layer for canvas mode: node-to-node navigation
 * (arrows always, j/k only with Vim Mode on), Shift+J/Shift+K's finer-
 * grained walk through every node's own configured items (always available,
 * regardless of Vim Mode), and this app's own mnemonic single-letter
 * operation shortcuts (s/w/o/g/p/+/x/u/U/i, always available -- these aren't
 * vim conventions and don't depend on Vim Mode) on whichever node currently
 * has keyboard focus (CanvasStore.focusedAlias).
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
      // canvasActive: Canvas is the mounted graph editor (layout/mode check).
      // activeKeyboardPanel: who currently owns bare-key input (DOM-focus
      // check) -- see GlobalStore.activeKeyboardPanel's own comment. Both
      // must hold: without the second check, j/k fired here even while
      // Settings' rail (or the Pine/SQL Input panel) had real focus.
      if (!global.canvasActive || global.activeKeyboardPanel !== 'graph') return;

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

      // Conventional undo/redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y),
      // alongside vim's own u/Shift+U below - same actions, just the
      // shortcut most people already know. Checked ahead of the plain-key
      // switch since these need a modifier check the switch below doesn't
      // do. Safe to claim here: the guards above already bail out whenever
      // a real text input has focus, so Ctrl+Z still reaches CodeMirror's
      // own undo there instead of being intercepted.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canvasStore.canRedo) canvasStore.redo();
        } else if (canvasStore.canUndo) {
          canvasStore.undo();
        }
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (canvasStore.canRedo) canvasStore.redo();
        return;
      }

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

      // Arrow-key navigation always works, vim mode or not - it's plain
      // directional navigation, not a vim convention, so there's no reason
      // to gate it on global.vimMode the way j/k below are.
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          canvasStore.focusNext();
          return;
        case 'ArrowUp':
          e.preventDefault();
          canvasStore.focusPrev();
          return;
      }

      // j/k are vim's own hjkl movement keys, gated on global.vimMode the
      // same way PineInput.tsx/SqlInput.tsx gate CodeMirror's vim mode --
      // one app-wide "Vim Mode" preference governs both. This does NOT
      // extend to the single-letter operation shortcuts below (s/w/o/g/x/
      // u/U/i), nor to Shift+J/Shift+K below - those are this app's own
      // mnemonic scheme for canvas operations, not vim conventions, and
      // stay independent of this setting (confirmed live: gating them on
      // Vim Mode too was wrong, since they have nothing to do with vim in
      // the first place).
      if (global.vimMode) {
        switch (e.key) {
          case 'j':
            e.preventDefault();
            canvasStore.focusNext();
            return;
          case 'k':
            e.preventDefault();
            canvasStore.focusPrev();
            return;
        }
      }

      switch (e.key) {
        // The fine-grained counterpart to plain j/k (or ArrowUp/Down) above:
        // those jump straight between nodes, skipping whatever's configured
        // on each one. Shift+J/Shift+K instead walk EVERY stop in the
        // pipeline one at a time - a node's own bare stop, then its
        // incoming join/select columns/where conditions/order columns/
        // group columns, then the next node's - see CanvasStore.flatStops.
        // Deliberately not ArrowLeft/ArrowRight (an earlier version of this):
        // "next"/"previous" in that flat sequence has nothing to do with
        // on-screen left/right - a "belongs to" relation can render a
        // node's own parent to its LEFT (confirmed live: pressing the arrow
        // that reads as "forward" kept landing on a node rendered further
        // left on screen, which read as backwards). J/K read as "next/
        // previous" the same way they already do for plain j/k, with no
        // implied screen direction to contradict. `e.key` is 'J'/'K' (not
        // 'j'/'k' + shiftKey) when Shift is held - same convention as 'U'
        // below - and this is deliberately NOT gated on global.vimMode: it's
        // this app's own mnemonic scheme, not a vim convention (see the
        // comment on plain j/k above).
        case 'J':
          e.preventDefault();
          canvasStore.configNext();
          return;
        case 'K':
          e.preventDefault();
          canvasStore.configPrev();
          return;
        // Opens whatever Shift+J/Shift+K above last highlighted on the
        // focused node - the same editor its mouse equivalent (TraceEdge's
        // own click, or a where chip's click) opens. A bare Enter/Space
        // with nothing highlighted falls through to the `default: return`
        // below, same as any other unbound key.
        case 'Enter':
        case ' ':
          if (canvasStore.focusedConfigItem) {
            e.preventDefault();
            canvasStore.openConfigCursor(anchorFor(alias));
          }
          return;
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
        case 'p':
          // Unlike 'g', offered on a checkpoint too - a sealed group:/limit:
          // output is just as valid a place to search paths from as any real
          // table (pine-lang's `? table` resolves through it the same way a
          // real join does - see ast/table.clj's resolve-table).
          if (isStart) return;
          e.preventDefault();
          if (isFrame) void canvasStore.openCheckpointPicker('path', anchorFor(alias));
          else canvasStore.openPathPicker(alias, anchorFor(alias));
          return;
        // The "+" overflow itself - o/g/p above already jump straight to
        // their target, so this exists for someone who wants to see what's
        // behind the button rather than recall the individual letter.
        // Mirrors TableNode.tsx's/FrameNode.tsx's own "+" button onClick
        // exactly, including which actions each offers (no 'group' on a
        // frame - see FrameNode.tsx's own doc comment).
        case '+':
          if (isStart) return;
          e.preventDefault();
          canvasStore.openMorePicker(alias, isFrame ? ['order', 'path'] : ['order', 'group', 'path'], isFrame, anchorFor(alias));
          return;
        // 'x' and Delete/Backspace are the same gesture - "remove the thing
        // that's the target of a key right now" - so a person who reaches
        // for Delete (the natural instinct on a regular keyboard) gets
        // exactly what 'x' (this app's original, vim-flavored binding) does.
        // With a config item highlighted (see Shift+J/Shift+K above),
        // that target is the highlighted chip/join, not the whole node -
        // the keyboard equivalent of that item's own ChipRow `×`.
        case 'x':
        case 'Delete':
        case 'Backspace': {
          if (isStart) return;
          if (canvasStore.focusedConfigItem) {
            e.preventDefault();
            void canvasStore.removeConfigCursor();
            return;
          }
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
