import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { CanvasStore } from '../../store/canvas/canvas.store';
import { activeGlobalOperation } from './nodes/TableNode';

/** How much of the canvas's bottom the bar takes: Canvas.tsx keeps the graph above it. */
export const operationBarSpace = 60;

// The bar is at the bottom of the canvas, so its pickers open upward, from the bar's top edge.
const upward = (e: React.MouseEvent) => {
  const bar = document.querySelector('[data-testid="canvas-operation-bar"]')?.getBoundingClientRect();
  return { x: e.clientX, y: bar ? bar.top : e.clientY, above: true };
};

/**
 * One action of the bar, drawn as a button: a bordered box that lights up
 * under the pointer, so it reads as something to click. Its label is in
 * capitals. While the canvas has the keyboard, the letter at `keyIndex` -
 * the key that does the same - is bold and the rest dimmed, as the node's
 * action bar used to show it. While another of the bar's pickers is open,
 * the button dims.
 */
const BarButton = ({
  label,
  testId,
  onClick,
  dimmed,
  keyIndex,
}: {
  label: string;
  testId: string;
  onClick: (e: React.MouseEvent) => void;
  dimmed: boolean;
  keyIndex?: number;
}) => {
  const [hover, setHover] = useState(false);
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
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        padding: '5px 12px',
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
      {keyIndex !== undefined ? (
        <>
          <span style={{ color: 'var(--canvas-text-dim)' }}>{label.slice(0, keyIndex)}</span>
          <span style={{ fontWeight: 800 }}>{label[keyIndex]}</span>
          <span style={{ color: 'var(--canvas-text-dim)' }}>{label.slice(keyIndex + 1)}</span>
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
 * is read there. Canvas.tsx keeps the graph above it (operationBarSpace).
 *
 * Join, select and where, and "+" for the rest: order, group, limit and
 * path for the query, traverse, describe and references for the selected
 * table, and unnest (CanvasStore.openOperationMore). Join, traverse,
 * describe and references are for the selected table, or the one the query
 * goes on from (CanvasStore.selectedNodeActions). The column pickers list
 * every table's columns, the selected table's first (beamlynx-plans #28).
 *
 * It gives way while the multi-select toolbar shows, which has its own
 * limit. While one of its pickers is open, the other buttons dim.
 */
const OperationBar: React.FC<{ canvasStore: CanvasStore }> = observer(({ canvasStore }) => {
  if (!canvasStore.selectedNodeActions || !canvasStore.operationAnchor || canvasStore.selectedAliases.length >= 2) {
    return null;
  }
  const active = activeGlobalOperation(canvasStore.picker);
  // Order, group, limit and path are behind "+".
  const shown = active === 'order' || active === 'group' || active === 'limit' || active === 'path' ? 'more' : active;
  const keys = canvasStore.mode === 'normal';
  const dim = (kind: string) => shown !== null && shown !== kind;
  return (
    <div
      className="nodrag"
      data-testid="canvas-operation-bar"
      style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 15,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 6,
        background: 'var(--canvas-node-bg)',
        border: '1px solid var(--canvas-node-border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}
    >
      {/* `i` (insert) or `|` joins: it's join's third letter. */}
      <BarButton
        label="join"
        testId="operation-join"
        onClick={e => canvasStore.openNodeAction('join', upward(e))}
        dimmed={dim('join')}
        keyIndex={keys ? 2 : undefined}
      />
      <BarButton
        label="select"
        testId="operation-select"
        onClick={e => canvasStore.openOperation('select', upward(e))}
        dimmed={dim('select')}
        keyIndex={keys ? 0 : undefined}
      />
      <BarButton
        label="where"
        testId="operation-where"
        onClick={e => canvasStore.openOperation('where', upward(e))}
        dimmed={dim('where')}
        keyIndex={keys ? 0 : undefined}
      />
      <BarButton
        label="+"
        testId="operation-more"
        onClick={e => canvasStore.openOperationMore(upward(e))}
        dimmed={dim('more')}
      />
    </div>
  );
});

export default OperationBar;
