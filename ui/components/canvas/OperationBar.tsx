import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { CanvasStore } from '../../store/canvas/canvas.store';
import { GLOBAL_OPERATIONS } from '../../store/canvas/canvas.model';
import { activeGlobalOperation } from './nodes/TableNode';

// The bar is at the bottom of the canvas, so its pickers open upward, from the bar's top edge.
const upward = (e: React.MouseEvent) => {
  const bar = document.querySelector('[data-testid="canvas-operation-bar"]')?.getBoundingClientRect();
  return { x: e.clientX, y: bar ? bar.top : e.clientY, above: true };
};

/**
 * One action of the bar, drawn as a button: a bordered box that lights up
 * under the pointer, so it reads as something to click. While another of
 * the bar's pickers is open, it dims. `shortcut` is the key that does the
 * same, underlined in its label while the canvas has the keyboard.
 */
const BarButton = ({
  label,
  testId,
  onClick,
  dimmed,
  shortcut,
}: {
  label: string;
  testId: string;
  onClick: (e: React.MouseEvent) => void;
  dimmed: boolean;
  shortcut?: string;
}) => {
  const [hover, setHover] = useState(false);
  const at = shortcut ? label.indexOf(shortcut) : -1;
  return (
    <button
      type="button"
      data-testid={testId}
      // Picker.tsx's click-outside handler leaves these alone, so a click
      // here switches pickers instead of only closing the open one.
      className="picker-trigger"
      onClick={e => {
        e.stopPropagation();
        onClick(e);
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: 'var(--canvas-font)',
        fontSize: 'calc(12px * var(--text-scale, 1))',
        fontWeight: 600,
        padding: '4px 10px',
        borderRadius: 4,
        cursor: 'pointer',
        color: 'var(--canvas-trace)',
        background: hover ? 'var(--canvas-chip-bg)' : 'transparent',
        border: `1px solid ${hover ? 'var(--canvas-trace)' : 'var(--canvas-chip-border)'}`,
        opacity: dimmed ? 0.35 : 1,
        transition: 'opacity 0.1s ease-in-out, background 0.1s, border-color 0.1s',
        whiteSpace: 'nowrap',
      }}
    >
      {at >= 0 ? (
        <>
          {label.slice(0, at)}
          <span style={{ textDecoration: 'underline' }}>{label[at]}</span>
          {label.slice(at + 1)}
        </>
      ) : (
        label
      )}
    </button>
  );
};

/**
 * The next thing you can do to the query, at the bottom centre of the
 * canvas: tables are added below the ones before them, so the next step
 * is read there.
 *
 * One row: join, select, where, order, group, limit and path, and "+" for
 * traverse, describe, references and unnest. Join, traverse, describe and
 * references are for the selected table, or the one the query goes on
 * from (see CanvasStore.selectedNodeActions). The column pickers list
 * every table's columns, the selected table's first (beamlynx-plans #28).
 *
 * It gives way while the multi-select toolbar shows, which has its own
 * limit. While one of its pickers is open, the other buttons dim.
 */
const OperationBar: React.FC<{ canvasStore: CanvasStore }> = observer(({ canvasStore }) => {
  if (!canvasStore.selectedNodeActions || !canvasStore.operationAnchor || canvasStore.selectedAliases.length >= 2) return null;
  const active = activeGlobalOperation(canvasStore.picker);
  const offered = canvasStore.offeredOperations;
  const keys = canvasStore.mode === 'normal';
  const dim = (kind: string) => active !== null && active !== kind;
  return (
    <div
      className="nodrag"
      data-testid="canvas-operation-bar"
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 15,
        maxWidth: 'calc(100% - 16px)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 6,
        background: 'var(--canvas-node-bg)',
        border: '1px solid var(--canvas-node-border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}
    >
      <BarButton
        label="join"
        testId="operation-join"
        onClick={e => canvasStore.openNodeAction('join', upward(e))}
        dimmed={dim('join')}
      />
      {GLOBAL_OPERATIONS.filter(op => offered.operations.includes(op.kind)).map(op => (
        <BarButton
          key={op.kind}
          label={op.label}
          testId={`operation-${op.kind}`}
          onClick={e => canvasStore.openOperation(op.kind, upward(e))}
          dimmed={dim(op.kind)}
          shortcut={keys ? op.key : undefined}
        />
      ))}
      {offered.more && (
        <BarButton
          label="+"
          testId="operation-more"
          onClick={e => canvasStore.openOperationMore(upward(e))}
          dimmed={dim('more')}
        />
      )}
    </div>
  );
});

export default OperationBar;
