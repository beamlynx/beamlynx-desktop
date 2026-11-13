import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { CanvasStore } from '../../store/canvas/canvas.store';
import { MORE_ACTIONS, MoreAction, PickerAnchor, PickerState } from '../../store/canvas/canvas.model';

/** How much of the canvas's bottom the bar takes: Canvas.tsx keeps the graph above it. */
export const operationBarSpace = 60;

/**
 * Where every picker the bar opens goes: centred over the bar, just above
 * it, whichever button opened it. It reads as the bar opening upward, and
 * it doesn't jump from one button to the next. The keys use it too.
 */
export const barAnchor = (): PickerAnchor => {
  const bar = document.querySelector('[data-testid="canvas-operation-bar"]')?.getBoundingClientRect();
  if (!bar) return { x: 24, y: 24 };
  return { x: bar.left + bar.width / 2, y: bar.top, above: true, centered: true };
};

/** Which of the bar's actions has its picker open, if any: the others dim. */
const activeBarAction = (picker: PickerState): string | null => {
  if (!picker.open) return null;
  if (picker.mode === 'where-value') return 'where';
  if (picker.mode === 'order-direction') return 'order';
  if (picker.mode === 'limit-value') return 'limit';
  if (picker.mode === 'traverse') return 'traverse';
  if (picker.mode !== 'list') return null;
  const kind = picker.request.kind;
  return kind === 'path-route' ? 'path' : kind === 'table' ? null : kind;
};

/**
 * One action of the bar, drawn as a button: a bordered box that lights up
 * under the pointer, so it reads as something to click. Its label is in
 * capitals. While the canvas has the keyboard, the letter at `keyIndex` -
 * the key that does the same - is bold and the rest dimmed. While another
 * of the bar's pickers is open, the button dims.
 */
const BarButton = ({
  label,
  testId,
  onClick,
  dimmed,
  keyIndex,
  children,
}: {
  label: string;
  testId: string;
  onClick: (e: React.MouseEvent) => void;
  dimmed: boolean;
  keyIndex?: number;
  children?: React.ReactNode;
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
        flexShrink: 0,
      }}
    >
      {children ??
        (keyIndex !== undefined ? (
          <>
            <span style={{ color: 'var(--canvas-text-dim)' }}>{label.slice(0, keyIndex)}</span>
            <span style={{ fontWeight: 800 }}>{label[keyIndex]}</span>
            <span style={{ color: 'var(--canvas-text-dim)' }}>{label.slice(keyIndex + 1)}</span>
          </>
        ) : (
          label
        ))}
    </button>
  );
};

/**
 * The next thing you can do to the query, at the bottom centre of the
 * canvas: tables are added below the ones before them, so the next step
 * is read there. Canvas.tsx keeps the graph above it (operationBarSpace).
 *
 * Join, select and where, and "+", which grows the bar to show the rest in
 * it: order, group, limit, path and count for the query, traverse,
 * describe and references for the selected table, and unnest
 * (CanvasStore.barMoreActions). The column pickers list every table's
 * columns, the selected table's first (beamlynx-plans #28). Every picker
 * opens in the same place, above the bar (barAnchor).
 *
 * While the pointer is on a table, its own buttons are the ones that
 * apply (TableNode.tsx), so the bar dims. It gives way while the
 * multi-select toolbar shows, which has its own limit.
 */
const OperationBar: React.FC<{ canvasStore: CanvasStore }> = observer(({ canvasStore }) => {
  if (!canvasStore.selectedNodeActions || !canvasStore.operationAnchor || canvasStore.selectedAliases.length >= 2) {
    return null;
  }
  // A picker opened from a node's own buttons isn't the bar's.
  const active = canvasStore.nodePicker ? null : activeBarAction(canvasStore.picker);
  const pointed = !!canvasStore.pointerAlias;
  // While the pointer is on a node, the keys are that node's (TableNode.tsx).
  const keys = canvasStore.mode === 'normal' && !pointed;
  const dim = (kind: string) => active !== null && active !== kind;
  const expanded = canvasStore.barExpanded;
  const more = MORE_ACTIONS.filter(a => canvasStore.barMoreActions.includes(a.action));
  const close = () => {
    // Clicking one of the main three closes the expanded part.
    if (expanded) canvasStore.collapseBar();
  };
  const run = (action: MoreAction) => canvasStore.runBarAction(action, barAnchor());
  return (
    <div
      className="nodrag"
      data-testid="canvas-operation-bar"
      data-expanded={expanded || undefined}
      style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 15,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        width: 'max-content',
        padding: '6px 10px',
        borderRadius: 6,
        background: 'var(--canvas-node-bg)',
        border: '1px solid var(--canvas-node-border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        opacity: pointed ? 0.4 : 1,
        transition: 'opacity 0.15s ease-in-out',
        maxWidth: 'calc(100% - 32px)',
      }}
    >
      {/* `i` (insert) or `|` joins: it's join's third letter. */}
      <BarButton
        label="join"
        testId="operation-join"
        onClick={() => {
          close();
          canvasStore.openNodeAction('join', barAnchor());
        }}
        dimmed={dim('join')}
        keyIndex={keys ? 2 : undefined}
      />
      <BarButton
        label="select"
        testId="operation-select"
        onClick={() => {
          close();
          canvasStore.openOperation('select', barAnchor());
        }}
        dimmed={dim('select')}
        keyIndex={keys ? 0 : undefined}
      />
      <BarButton
        label="where"
        testId="operation-where"
        onClick={() => {
          close();
          canvasStore.openOperation('where', barAnchor());
        }}
        dimmed={dim('where')}
        keyIndex={keys ? 0 : undefined}
      />
      {/* The rest, in the bar itself, each fading in a moment after the one
          before it. On a narrow canvas the bar wraps onto a second row. */}
      {expanded &&
        more.map((a, i) => (
          <span key={a.action} className="operation-bar-action-in" style={{ animationDelay: `${i * 25}ms` }}>
            <BarButton
              label={a.label}
              testId={`operation-${a.action}`}
              onClick={() => run(a.action)}
              dimmed={dim(a.action)}
              keyIndex={keys ? a.label.indexOf(a.key) : undefined}
            />
          </span>
        ))}
      <BarButton
        label={expanded ? 'Fewer actions' : 'More actions'}
        testId="operation-more"
        onClick={() => canvasStore.toggleBarMore()}
        dimmed={active !== null && !expanded}
      >
        {/* The + turns into a × while the bar is open. */}
        <span
          aria-label={expanded ? 'Fewer actions' : 'More actions'}
          className="operation-bar-plus"
          style={{ display: 'inline-block', transform: expanded ? 'rotate(45deg)' : 'none' }}
        >
          +
        </span>
      </BarButton>
    </div>
  );
});

export default OperationBar;
