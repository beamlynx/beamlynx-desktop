import React from 'react';
import { observer } from 'mobx-react-lite';
import { CanvasStore } from '../../store/canvas/canvas.store';
import { GLOBAL_OPERATIONS } from '../../store/canvas/canvas.model';
import { ActionButton, ActionDivider, activeGlobalOperation } from './nodes/TableNode';

/**
 * The operations that work on the whole query: select, where, order, group,
 * limit and path, and unnest behind "+" (beamlynx-plans #28). A select or a
 * filter is about the query, not one table, so they live here and not on
 * each node. Their pickers list every table's columns: the focused node's
 * first, then the most recent table's, then the rest, nearest first.
 *
 * Drawn like a node's action bar (the same buttons and dividers), in its
 * own box right of the canvas toolbar (CanvasToolbar.tsx). It gives way
 * while the multi-select toolbar shows, which has its own limit. While one
 * of its pickers is open, the others dim, as on a node.
 */
const OperationBar: React.FC<{ canvasStore: CanvasStore }> = observer(({ canvasStore }) => {
  if (!canvasStore.operationAnchor || canvasStore.selectedAliases.length >= 2) return null;
  const active = activeGlobalOperation(canvasStore.picker);
  const showKeys = canvasStore.mode === 'normal';
  return (
    <div
      className="nodrag"
      data-testid="canvas-operation-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        padding: '4px 8px',
        borderRadius: 4,
        background: 'var(--canvas-node-bg)',
        border: '1px solid var(--canvas-node-border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      {GLOBAL_OPERATIONS.map((op, i) => (
        <React.Fragment key={op.kind}>
          {i > 0 && <ActionDivider />}
          <ActionButton
            label={op.label}
            testId={`operation-${op.kind}`}
            onClick={anchor => canvasStore.openOperation(op.kind, anchor)}
            emphasizeKey={showKeys}
            suppressed={active !== null && active !== op.kind}
          />
        </React.Fragment>
      ))}
      <ActionDivider />
      <ActionButton
        label="+"
        testId="operation-more"
        onClick={anchor => canvasStore.openOperationMore(anchor)}
        suppressed={active !== null && active !== 'more'}
      />
    </div>
  );
});

export default OperationBar;
