import React, { useEffect } from 'react';
import { NodeProps, Position, useUpdateNodeInternals } from 'reactflow';
import { CanvasFrameNodeData } from '../../../store/canvas/canvas.model';
import { useCanvasStore } from '../canvas-context';
import { ActionButton, ActionDivider, RelationDots } from './TableNode';

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
 */
const FrameNode: React.FC<NodeProps<CanvasFrameNodeData>> = ({ id, data }) => {
  const canvasStore = useCanvasStore();
  const updateNodeInternals = useUpdateNodeInternals();
  const handleKey = [...data.leftHandles, ...data.rightHandles].map(h => h.id).join(',');

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, handleKey, updateNodeInternals]);

  const openAction = (kind: 'select' | 'where' | 'order' | 'join') => (anchor: { x: number; y: number }) =>
    void canvasStore.openCheckpointPicker(kind, anchor);

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
    <div style={{ width: data.width, height: data.height, position: 'relative', pointerEvents: 'none' }}>
      {/* picker-trigger: Picker.tsx's click-outside-to-close listener skips
          elements with this class, same as TableNode's own action bar - see
          that file's comment on ActionButton for why. */}
      <div
        className="nodrag picker-trigger"
        style={{
          position: 'absolute',
          top: 0,
          left: 12,
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          zIndex: 1,
          pointerEvents: 'auto',
        }}
      >
        <ActionButton label="select" testId={`frame-action-select-${id}`} onClick={openAction('select')} />
        <ActionDivider />
        <ActionButton label="join" testId={`frame-action-join-${id}`} onClick={openAction('join')} />
        <ActionDivider />
        <ActionButton label="where" testId={`frame-action-where-${id}`} onClick={openAction('where')} />
        <ActionDivider />
        <ActionButton label="order" testId={`frame-action-order-${id}`} onClick={openAction('order')} />
      </div>
      <div
        style={{
          position: 'absolute',
          top: frameHeaderHeight,
          left: 0,
          width: data.width,
          height: data.height - frameHeaderHeight,
          border: '1.5px dashed var(--canvas-container-border)',
          background: 'var(--canvas-container-bg)',
          borderRadius: 6,
        }}
      >
        <RelationDots handles={data.leftHandles} type="target" position={Position.Left} />
        <RelationDots handles={data.rightHandles} type="source" position={Position.Right} />
      </div>
    </div>
  );
};

export default FrameNode;
