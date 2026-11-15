import React, { useLayoutEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { CanvasStore } from '../../store/canvas/canvas.store';
import { useStores } from '../../store/store-container';
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

/** The space between the bar's buttons, and the bar's side padding. */
const barGap = 6;
const barPadding = 10;
/** A divider's width with its margins. */
const dividerSpace = 5;

/** The extra actions for the whole query. The others are for the selected table, past a divider. */
const QUERY_ACTIONS: MoreAction[] = ['order', 'group', 'limit', 'count', 'path'];

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
  hidden,
  children,
}: {
  label: string;
  testId: string;
  onClick: (e: React.MouseEvent) => void;
  dimmed: boolean;
  keyIndex?: number;
  /** In the closed part of the bar: drawn at no size, so out of Tab's way too. */
  hidden?: boolean;
  children?: React.ReactNode;
}) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      data-testid={testId}
      tabIndex={hidden ? -1 : undefined}
      aria-hidden={hidden || undefined}
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
          // No key works now: all of it dim, so nothing reads as active.
          <span style={{ color: 'var(--canvas-text-dim)' }}>{label}</span>
        ))}
    </button>
  );
};

/**
 * The next thing you can do to the query, at the bottom centre of the
 * canvas: tables are added below the ones before them, so the next step
 * is read there. Canvas.tsx keeps the graph above it (operationBarSpace).
 *
 * Join, select and where, and `›`, which grows the bar to show the rest in
 * it, past a divider: order, group, limit, count and path for the query,
 * then, past another, the selected table's: traverse, describe, references
 * and unnest (CanvasStore.barMoreActions). The column pickers list every table's
 * columns, the selected table's first (beamlynx-plans #28). Every picker
 * opens in the same place, above the bar (barAnchor).
 *
 * Tables have no buttons of their own: selecting one changes what the bar
 * offers, and the table's actions come in again so the change is seen. It
 * gives way while the multi-select toolbar shows, which has its own limit.
 */
const OperationBar: React.FC<{ canvasStore: CanvasStore }> = observer(({ canvasStore }) => {
  const { global } = useStores();
  const barRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const extrasRef = useRef<HTMLDivElement>(null);
  // What the bar offered for the table selected before. Selecting another
  // while the bar is open brings that table's actions in again, and marks
  // the ones the last table didn't have, so the change is seen.
  const seen = useRef<{ alias: string | null; actions: MoreAction[]; swapped: boolean; fresh: Set<MoreAction> }>({
    alias: null,
    actions: [],
    swapped: false,
    fresh: new Set(),
  });
  // Too narrow for every action on one row: the rest open upward, in rows
  // of their own above the bar, instead of reflowing it. `width` is how
  // wide those rows are, and `main` the bar's own row: the rows are laid
  // out at their full width and revealed from the centre, so nothing
  // reflows as they open.
  const [layout, setLayout] = useState<{ stacked: boolean; width: number; main: number }>({
    stacked: false,
    width: 0,
    main: 0,
  });
  useLayoutEffect(() => {
    const parent = barRef.current?.parentElement;
    if (!parent) return;
    const check = () => {
      const main = mainRef.current;
      const extras = extrasRef.current;
      if (!main || !extras) return;
      // The groups' own widths on one row, whichever layout they're in now:
      // wrapping doesn't change them. Plus the two dividers a row has.
      const groups = Array.from(extras.querySelectorAll<HTMLElement>('[data-bar-group]'));
      // A group's width on one line: its parts, which wrapping doesn't change.
      const lineWidth = (g: HTMLElement) => {
        const parts = Array.from(g.children) as HTMLElement[];
        // offsetWidth rounds: a pixel each keeps a group that fits from wrapping by a fraction.
        return parts.reduce((w, c) => w + c.offsetWidth + 1, 0) + barGap * Math.max(parts.length - 1, 0);
      };
      const natural = groups.reduce((w, g) => w + lineWidth(g), 0) + groups.length * (barGap + dividerSpace);
      const room = parent.clientWidth - 32 - 2 * barPadding;
      // The bar's own row: join, select, where and `›` only. On one row it
      // also holds the extras, and counting them here flipped the layout
      // back and forth without end.
      const own = Array.from(main.querySelectorAll<HTMLElement>(':scope > button'));
      const mainOwn = own.reduce((w, b) => w + b.offsetWidth, 0) + barGap * Math.max(own.length - 1, 0);
      const stacked = mainOwn + natural > room;
      // Both groups on one row above the bar if they fit, else one each.
      const widths = groups.map(lineWidth);
      const together = widths.reduce((a, b) => a + b, 0) + barGap * Math.max(widths.length - 1, 0);
      const width = Math.min(Math.max(together <= room ? together : Math.max(...widths), mainOwn), room);
      const next = { stacked, width: stacked ? width : 0, main: Math.round(mainOwn) };
      setLayout(prev =>
        prev.stacked === next.stacked && prev.width === next.width && prev.main === next.main ? prev : next,
      );
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(parent);
    return () => observer.disconnect();
  });
  if (!canvasStore.selectedNodeActions || !canvasStore.operationAnchor || canvasStore.selectedAliases.length >= 2) {
    return null;
  }
  const active = activeBarAction(canvasStore.picker);
  // The keys are always the bar's. A bold letter says its key works now:
  // not while typing goes elsewhere.
  const keys = canvasStore.mode === 'normal' && global.keyboardPane === 'graph';
  const dim = (kind: string) => active !== null && active !== kind;
  const expanded = canvasStore.barExpanded;
  const { stacked, width: rowsWidth, main: mainWidth } = layout;
  // Unfolded by a key, the bar shows only that key's action (CanvasStore.barOnly).
  const only = canvasStore.barOnly;
  const more = MORE_ACTIONS.filter(a => canvasStore.barMoreActions.includes(a.action) && (!only || a.action === only));
  // For the whole query, then for the selected table.
  const alias = canvasStore.operationAnchor;
  const offered = canvasStore.barMoreActions;
  {
    const before = seen.current;
    const added = offered.filter(a => !before.actions.includes(a));
    if (before.alias !== alias) {
      const watched = expanded && before.alias !== null;
      seen.current = { alias, actions: offered, swapped: watched, fresh: new Set(watched ? added : []) };
    } else if (added.length) {
      // Unnest comes once the probe for JSON columns answers.
      seen.current = { ...before, actions: offered, fresh: new Set(Array.from(before.fresh).concat(expanded ? added : [])) };
    }
  }
  const { swapped, fresh } = seen.current;
  const queryActions = more.filter(a => QUERY_ACTIONS.includes(a.action));
  const tableActions = more.filter(a => !QUERY_ACTIONS.includes(a.action));
  const close = () => {
    // Clicking one of the main three closes the expanded part.
    if (expanded) canvasStore.collapseBar();
  };
  const run = (action: MoreAction) => canvasStore.runBarAction(action, barAnchor());

  // The rest of the actions. Collapsed, they are still there, at no size,
  // so opening the bar can be watched: the strip slides open (row) or up
  // (stacked), and each button fades in behind its edge, one after another.
  let shown = 0;
  const item = (a: (typeof MORE_ACTIONS)[number], index: number) => {
    const delay = expanded ? 90 + shown++ * 30 : 0;
    return (
      <span
        key={a.action}
        className={fresh.has(a.action) ? 'bar-action-new' : undefined}
        style={{
          display: 'inline-flex',
          opacity: expanded ? 1 : 0,
          transform: expanded ? 'none' : 'translateY(2px)',
          transition: `opacity 180ms ease ${delay}ms, transform 180ms ease ${delay}ms`,
          // One after another when a table's actions come in again (bar-actions-swap).
          animationDelay: `${index * 40}ms`,
        }}
      >
        <BarButton
          label={a.label}
          testId={`operation-${a.action}`}
          onClick={() => run(a.action)}
          dimmed={dim(a.action)}
          keyIndex={keys ? a.label.indexOf(a.key) : undefined}
          hidden={!expanded}
        />
      </span>
    );
  };
  const divider = (key: string) => (
    <span
      key={key}
      aria-hidden
      style={{ width: 1, alignSelf: 'stretch', margin: '3px 2px', background: 'var(--canvas-chip-border)', flexShrink: 0 }}
    />
  );
  // Each group stays together on a row: the query's actions, and the
  // table's.
  const group = (key: string, children: React.ReactNode, className?: string) => (
    <span
      key={key}
      className={className}
      data-bar-group
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: barGap,
        flexShrink: 0,
        // A group wider than the canvas wraps within itself, in rows above the bar only.
        ...(stacked ? { flexWrap: 'wrap', justifyContent: 'center', maxWidth: '100%' } : {}),
      }}
    >
      {children}
    </span>
  );
  const queryGroup = queryActions.length ? group('query', queryActions.map(item)) : null;
  const tableGroup = tableActions.length
    ? // No name in front: the selected table's ring already says which one.
      // Keyed by the table, so selecting another brings its actions in again.
      group(`table-${alias}`, tableActions.map(item), swapped ? 'bar-actions-swap' : undefined)
    : null;
  // In a row of the bar, a divider before each group; rows of their own need none.
  const extrasContent = stacked
    ? [queryGroup, tableGroup]
    : [queryGroup && divider('divider-query'), queryGroup, tableGroup && divider('divider-table'), tableGroup];
  const slide = 'cubic-bezier(0.2, 0, 0, 1)';
  const extras = stacked ? (
    // Opens upward (the rows' height) and outward from the centre (a clip
    // widening from the bar's own width to the rows'), over rows laid out
    // at their full width.
    <div
      data-testid="operation-bar-extras"
      data-stacked="true"
      style={{ display: 'grid', gridTemplateRows: expanded ? '1fr' : '0fr', transition: `grid-template-rows 240ms ${slide}` }}
    >
      <div
        style={{
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          justifySelf: 'center',
          width: expanded ? rowsWidth : mainWidth,
          transition: `width 240ms ${slide}`,
        }}
      >
        <div
          ref={extrasRef}
          style={{
            width: rowsWidth,
            flexShrink: 0,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: barGap,
            // The space between these rows and the bar's own.
            paddingBottom: barGap,
          }}
        >
          {extrasContent}
        </div>
      </div>
    </div>
  ) : (
    <div
      data-testid="operation-bar-extras"
      style={{
        display: 'grid',
        gridTemplateColumns: expanded ? '1fr' : '0fr',
        // Closed, it takes back the gap before it as well.
        marginLeft: expanded ? 0 : -barGap,
        transition: `grid-template-columns 240ms ${slide}, margin-left 240ms ${slide}`,
      }}
    >
      <div ref={extrasRef} style={{ minWidth: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: barGap }}>
        {extrasContent}
      </div>
    </div>
  );

  return (
    <div
      ref={barRef}
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
        flexDirection: 'column',
        alignItems: 'center',
        width: 'max-content',
        padding: `6px ${barPadding}px`,
        borderRadius: 6,
        background: 'var(--canvas-node-bg)',
        border: '1px solid var(--canvas-node-border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        maxWidth: 'calc(100% - 32px)',
      }}
    >
      {stacked && extras}
      <div ref={mainRef} style={{ display: 'flex', alignItems: 'center', gap: barGap }}>
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
      {!stacked && extras}
      {/* `›` opens the rest, and turns to `‹` to close them. It rides the
          end of the bar as it grows. Not a ×: on the canvas, × removes. */}
      <BarButton
        label={expanded ? 'Fewer actions' : 'More actions'}
        testId="operation-more"
        onClick={() => canvasStore.toggleBarMore()}
        dimmed={active !== null && !expanded}
      >
        <span
          aria-label={expanded ? 'Fewer actions' : 'More actions'}
          className="operation-bar-more"
          style={{ display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none' }}
        >
          ›
        </span>
      </BarButton>
      </div>
    </div>
  );
});

export default OperationBar;
