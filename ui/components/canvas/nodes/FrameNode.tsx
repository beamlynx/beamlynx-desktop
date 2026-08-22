import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { NodeProps, Position, useUpdateNodeInternals } from 'reactflow';
import { CanvasFrameNodeData } from '../../../store/canvas/canvas.model';
import { useCanvasStore } from '../canvas-context';
import { ActionButton, ActionDivider, DeleteButton, RelationDots, activeOperationFor, pickerAliasFor } from './TableNode';

const frameHeaderHeight = 30;

/**
 * Background frame for a pipeline that currently ends in an unconsumed
 * group:/limit: checkpoint (CanvasStore.recompute's hasTrailingCheckpoint
 * check, purely a text-structure signal - see the plan doc's container-node
 * follow-up pass for why pending-assignments alone can't be used for this),
 * or for a checkpoint that HAS been joined onto/composed on top of, whose
 * own join handles this frame now carries (see below).
 *
 * The tables inside it (tenant, company, ...) keep rendering as their own
 * normal, fully-interactive TableNode instances, completely unchanged -
 * this is a decoration drawn behind them (layout.ts's makeFrameNode gives it
 * zIndex -1 and sizes it to their bounding box), not a node that replaces
 * or collapses them. Its own action bar operates on the checkpoint's sealed
 * output, pinning an explicit `|= name` on first use if one doesn't already
 * exist - see CanvasStore.ensureCheckpointPinned/openCheckpointPicker.
 *
 * `join` targets the checkpoint's own sealed output (the "hop" case) - the
 * frame's node id is the checkpoint's pinned name itself (layout.ts's
 * deriveGraph/makeFrameNode), exactly the alias a resulting join addresses
 * in ast.joins, so a table joined onto it attaches its edge to this frame's
 * own handles like any other node. Still not offered: grouping the
 * checkpoint's own already-grouped output - a different semantic question,
 * left for a later pass rather than offered here half-working.
 *
 * Selectable via keyboard exactly like a table node - CanvasStore.
 * orderedFocusTargets slots this frame's own id into the same navigable
 * sequence (by `data.memberOrder`, its highest-order member table), and
 * useCanvasKeybindings.ts dispatches s/w/o/i to openCheckpointPicker instead
 * of openColumnPicker/openJoinPicker when the focused alias is a frame.
 */
const FrameNode: React.FC<NodeProps<CanvasFrameNodeData>> = observer(({ id, data }) => {
  const canvasStore = useCanvasStore();
  const updateNodeInternals = useUpdateNodeInternals();
  const handleKey = [...data.leftHandles, ...data.rightHandles].map(h => h.id).join(',');
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, handleKey, updateNodeInternals]);

  const openAction = (kind: 'select' | 'where' | 'order' | 'join') => (anchor: { x: number; y: number }) =>
    void canvasStore.openCheckpointPicker(kind, anchor);

  // Same "shown as current" treatment TableNode.tsx/StartNode.tsx use for
  // keyboard focus - see that file's isFocusTarget comment for why this
  // doubles as the AST's current-node treatment without eagerly touching
  // the AST itself.
  const isFocusTarget = canvasStore.focusedAlias === id;
  // `id` is only ever the checkpoint's real alias for a *consumed* frame -
  // a still-pending checkpoint (the pipeline's tail) renders under the
  // fixed placeholder PENDING_CHECKPOINT_FRAME_ID instead, even once it has
  // a real pinned name underneath (eager background pinning can name it
  // well before anything is built on top - see that constant's own doc
  // comment). `canvasStore.picker` is always keyed by the real name
  // (openCheckpointPicker resolves it before opening), so anything here
  // comparing against the picker must go through the resolved alias, not
  // `id` directly, or the comparison silently never matches.
  const resolvedAlias = canvasStore.resolveFrameAlias(id);

  // Mouse hover can only be tracked on the action-bar strip itself - it's
  // the one area of this node that's actually hit-testable (`pointerEvents:
  // 'auto'` below); everywhere else deliberately stays click-through (see
  // the root div's own comment) so rubber-band multi-select still works
  // over the rest of the frame's bounding box, including the gaps between
  // its member tables. Adding a hover surface anywhere else would
  // reintroduce exactly that regression.
  const engaged = hovered || isFocusTarget || pickerAliasFor(canvasStore.picker) === resolvedAlias;

  // Same decluttering as TableNode.tsx's own action bar: while a picker this
  // frame opened is already in flight, dim the other three rather than
  // removing them - see ActionButton's `suppressed` doc comment for why
  // (removing them shifts the survivor to a different on-screen position).
  const operations: { kind: 'select' | 'join' | 'where' | 'order'; label: string }[] = [
    { kind: 'select', label: 'select' },
    { kind: 'join', label: 'join' },
    { kind: 'where', label: 'where' },
    { kind: 'order', label: 'order' },
  ];
  const activeOperation = activeOperationFor(canvasStore.picker, resolvedAlias);

  return (
    // pointerEvents 'none' on the ROOT, not just the border div below - this
    // element covers the whole bounding box, including every gap between
    // the live nodes it wraps, and without this it was the topmost thing at
    // every one of those points: swallowing the mousedown that starts a
    // rubber-band multi-select drag (confirmed live - selection stopped
    // working entirely once a frame was present) and, since a plain element
    // sitting there also determines the cursor CSS applies at that point,
    // showing a stray pointer/grab cursor across the whole frame even away
    // from the action bar. The action bar div below opts back into
    // 'auto' explicitly - a descendant can re-enable pointer events even
    // under a 'none' ancestor, so this is the one clickable island.
    <div
      data-testid={`canvas-node-${id}`}
      style={{ width: data.width, height: data.height, position: 'relative', pointerEvents: 'none' }}
    >
      {/* picker-trigger: Picker.tsx's click-outside-to-close listener skips
          elements with this class, same as TableNode's own action bar - see
          that file's comment on ActionButton for why. */}
      <div
        className="nodrag picker-trigger"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'absolute',
          top: 0,
          left: 12,
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          zIndex: 1,
          pointerEvents: 'auto',
          // Same opacity-only reveal as TableNode.tsx's own action bar (see
          // its `engaged` comment for why this and not conditional
          // rendering/pointer-events gating) - contextual rather than
          // permanently visible, now that hover/focus exist for this node.
          opacity: engaged ? 1 : 0,
          transition: 'opacity 0.1s ease-in-out',
        }}
      >
        {operations.map((op, i) => (
          <React.Fragment key={op.kind}>
            {i > 0 && <ActionDivider />}
            <ActionButton
              label={op.label}
              testId={`frame-action-${op.kind}-${id}`}
              onClick={openAction(op.kind)}
              suppressed={activeOperation !== null && op.kind !== activeOperation}
            />
          </React.Fragment>
        ))}
      </div>
      <div
        style={{
          boxSizing: 'border-box',
          position: 'absolute',
          top: frameHeaderHeight,
          left: 0,
          width: data.width,
          height: data.height - frameHeaderHeight,
          // Thicker on focus, same purple family throughout - a container
          // stays visually a container (unlike a table/checkpoint's own
          // "shown as current" blue), just more emphatic about it, matching
          // the weight-only (not a new hue) emphasis convention this
          // session settled on for the action-bar letter hints.
          border: isFocusTarget
            ? '3px dashed var(--canvas-container-border)'
            : '1.5px dashed var(--canvas-container-border)',
          background: 'var(--canvas-container-bg)',
          borderRadius: 6,
        }}
      >
        <RelationDots handles={data.leftHandles} type="target" position={Position.Left} />
        <RelationDots handles={data.rightHandles} type="source" position={Position.Right} />
      </div>
      {/* Cancels the container itself (removes the whole group:/limit:/name
          run, leaving its member tables as plain nodes again) - the "x"
          keybinding's mouse equivalent, same DeleteButton TableNode.tsx
          uses for the identical kind of one-off destructive action.
          Positioned against the ROOT's own box (top-right of the frame's
          full width/height, header included), not the action-bar div above
          it, which is only as wide as its own buttons. `pointerEvents:
          'auto'` opts back in from the root's 'none', same as the action
          bar. */}
      <div
        className="nodrag"
        style={{ pointerEvents: 'auto', opacity: engaged ? 1 : 0, transition: 'opacity 0.1s ease-in-out' }}
      >
        <DeleteButton testId={`frame-delete-${id}`} onClick={() => void canvasStore.deleteCheckpoint(id)} />
      </div>
    </div>
  );
});

export default FrameNode;
