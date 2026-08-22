import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
  CanvasTableNode,
  PickerAnchor,
  PickerItem,
  WHERE_OPERATORS,
} from '../../store/canvas/canvas.model';
import { useCanvasStore } from './canvas-context';

const pickerWidth = 280;
const pickerHeight = 320;

// The panel itself no longer scrolls as one piece (see `bodyStyle` below) -
// it's a fixed-height flex column so the filter row stays put as a header
// and only the results list scrolls beneath it.
const basePickerStyle: React.CSSProperties = {
  position: 'fixed',
  zIndex: 20,
  minWidth: 220,
  maxWidth: pickerWidth,
  maxHeight: pickerHeight,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: 'var(--canvas-picker-bg)',
  border: '1px solid var(--canvas-picker-border)',
  borderRadius: '4px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
  color: 'var(--canvas-text)',
  fontFamily: 'var(--canvas-font)',
  fontSize: '11px',
};

// The filter input used to live inside the same scrolling container as the
// results, so scrolling down a long list scrolled the filter away with it -
// exactly backwards, since the filter is what you'd reach for *because* the
// list is long. Pulled out as its own non-scrolling flex header instead.
const headerStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  justifyContent: 'space-between',
  padding: '8px 8px 6px 8px',
  borderBottom: '1px solid var(--canvas-picker-border)',
};

// The actual scrolling region - everything below the filter.
const bodyStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  padding: '6px 8px 8px 8px',
};

// Shared by every text input/select in the picker (the filter box, and the
// where-value step's operator/value fields) - previously each was left with
// only `{fontFamily, fontSize}` set, so they rendered with the browser's
// native control styling regardless of the app's own theme: a visibly
// unstyled patch inside an otherwise deliberately-themed panel.
const inputStyle: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 'inherit',
  background: 'var(--canvas-chip-bg)',
  color: 'var(--canvas-text)',
  border: '1px solid var(--canvas-chip-border)',
  borderRadius: 3,
  padding: '3px 6px',
};

// `fixed` (viewport-relative, not flow-canvas-relative) so the anchor's raw
// clientX/clientY - captured at the action button's click - can be used
// directly with no coordinate conversion. Clamped so a picker opened near an
// edge (e.g. the rightmost node's "select" button) still renders on-screen.
const anchoredStyle = (anchor: PickerAnchor): React.CSSProperties => {
  const margin = 8;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = Math.min(Math.max(anchor.x + margin, margin), vw - pickerWidth - margin);
  const top = Math.min(Math.max(anchor.y + margin, margin), vh - pickerHeight - margin);
  return { ...basePickerStyle, left, top };
};

const filterItems = (items: PickerItem[], filter: string): PickerItem[] => {
  if (!filter.trim()) return items;
  const f = filter.toLowerCase();
  return items.filter(i => i.label.toLowerCase().includes(f));
};

/** Already-selected columns sink to the bottom - they're done, so the columns still worth picking stay up top. */
const sinkSelected = (items: PickerItem[], selectedColumns: string[]): PickerItem[] => {
  if (selectedColumns.length === 0) return items;
  const unselected = items.filter(i => !selectedColumns.includes(i.value));
  const selected = items.filter(i => selectedColumns.includes(i.value));
  return [...unselected, ...selected];
};

const asTableHint = (item: PickerItem) => ({
  schema: item.detail ?? null,
  table: item.label,
  pine: item.value,
});

// The join picker's two groups aren't an arbitrary split - "has" (other
// tables that refer to this one - the FK points in) and "belongs to" (this
// table refers to another - the FK points out) are two different join
// directions, the same distinction the committed graph itself draws with
// join-direction arrows. Color them accordingly rather than by alternating
// position, so the color means something instead of just breaking up the
// list visually. Anything else (there's no other grouped picker today, but
// nothing here assumes there won't be) falls back to a neutral tone.
const groupAccent = (label: string): string => {
  if (label === 'has') return 'var(--canvas-trace)';
  if (label === 'belongs to') return 'var(--canvas-trace-uncertain)';
  return 'var(--canvas-node-border)';
};

const Picker: React.FC = observer(() => {
  const store = useCanvasStore();
  const picker = store.picker;
  const rootRef = useRef<HTMLDivElement>(null);

  // Keyboard-highlighted item, tracked by its position in the flattened
  // (grouped, filtered) list so ArrowUp/Down, Tab and Enter all agree on
  // "the current item" with mouse hover - see onMouseEnter below, which
  // keeps the two in sync rather than being two independent notions of
  // selection.
  const [highlighted, setHighlighted] = useState(0);

  // Computed unconditionally (rather than after the where-value early
  // return below) so `flatItems` can already sink selected columns to the
  // bottom - keyboard nav and the rendered rows must agree on one order.
  // Covers 'select', 'order' and 'group' - the picker kinds that stay open
  // for repeat picks and therefore need "already picked" reflected in the
  // list.
  let selectedColumns: string[] = [];
  if (
    picker.open &&
    picker.mode === 'list' &&
    (picker.request.kind === 'select' || picker.request.kind === 'order' || picker.request.kind === 'group')
  ) {
    const alias = picker.request.alias;
    const kind = picker.request.kind;
    const node = store.canvasGraph.nodes.find(
      (n): n is CanvasTableNode => n.type === 'table-node' && n.id === alias,
    );
    selectedColumns =
      kind === 'select'
        ? node?.data.selectColumns ?? []
        : kind === 'group'
          ? node?.data.groupChips ?? []
          : (node?.data.orderChips ?? []).map(chip => chip.replace(/\s+(asc|desc)$/i, ''));
  }

  const flatItems: PickerItem[] =
    picker.open && picker.mode === 'list' && !picker.loading && !picker.error
      ? picker.groups.flatMap(g =>
          sinkSelected(filterItems(g.items, picker.filter), selectedColumns),
        )
      : [];
  const flatKey = flatItems.map(i => i.id).join('|');

  // Reset to the top item whenever a fresh picker opens or the visible set
  // changes (typing narrows the filter, or results finish loading).
  useEffect(() => {
    setHighlighted(0);
  }, [picker.open, flatKey]);

  // Escape closes the picker regardless of what has focus - a per-input
  // onKeyDown only catches it while that specific input is focused, which
  // isn't reliable (e.g. focus lost to the ReactFlow canvas). A window-level
  // listener while the picker is open covers every case with one path.
  useEffect(() => {
    if (!picker.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store.closePicker();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [picker.open, store]);

  // Click-outside-to-close - standard dropdown behavior. Uses `mousedown`
  // (fires before `click`) so it resolves before whatever the click would
  // otherwise trigger. That ordering is exactly why a click on a
  // `picker-trigger` element (an action button, the start node) must be
  // skipped here rather than left to fall through: those elements decide
  // for themselves whether to open, switch, or - if their own picker is
  // already open - do nothing (see openListPicker's guard in
  // canvas.store.ts). If this handler closed the picker first, that guard
  // would always see `open: false` and reopen fresh, snapping the anchor to
  // the new click position - the exact bug the guard exists to prevent.
  // Registered on the CAPTURE phase (the `true` argument) - confirmed live
  // that ReactFlow's own pane handling stops a plain bubble-phase mousedown
  // from ever reaching `window`, which silently made this a no-op for any
  // click on the canvas itself (as opposed to elsewhere in the app, where it
  // worked). Capture fires top-down before ReactFlow's own listeners run, so
  // it isn't affected by anything downstream calling stopPropagation.
  useEffect(() => {
    if (!picker.open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (rootRef.current?.contains(target)) return;
      if (target?.closest('.picker-trigger')) return;
      store.closePicker();
    };
    window.addEventListener('mousedown', onMouseDown, true);
    return () => window.removeEventListener('mousedown', onMouseDown, true);
  }, [picker.open, store]);

  if (!picker.open) return null;

  if (picker.mode === 'where-value') {
    const node = store.canvasGraph.nodes.find(
      (n): n is CanvasTableNode => n.id === picker.alias && n.type === 'table-node',
    );
    return (
      <div
        ref={rootRef}
        style={{ ...anchoredStyle(picker.anchor), padding: 8 }}
        data-testid="canvas-picker"
      >
        <div style={{ marginBottom: 6 }}>
          {node?.data.table ?? picker.alias}.{picker.column}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <select
            value={picker.operator}
            onChange={e => store.setWhereOperator(e.target.value)}
            style={inputStyle}
          >
            {WHERE_OPERATORS.map(op => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            autoFocus
            value={picker.value}
            onChange={e => store.setWhereValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void store.submitWhereValue();
            }}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
          <span style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => store.closePicker()}>
            cancel
          </span>
          <span
            style={{ cursor: 'pointer', color: 'var(--canvas-trace)' }}
            onClick={() => void store.submitWhereValue()}
          >
            add
          </span>
        </div>
      </div>
    );
  }

  const onSelect = (item: PickerItem) => {
    const { request } = picker;
    switch (request.kind) {
      case 'table':
        store.commitFirstTable(asTableHint(item));
        return;
      case 'join':
        void store.commitJoin(asTableHint(item), request.alias);
        return;
      case 'select':
      case 'order':
      case 'group':
        // Unlike join/where, these three stay open for repeat picks - leaving
        // the just-typed filter in place would hide every other column
        // behind it, so clear it to hand the input back ready for the next.
        void (request.kind === 'select'
          ? store.toggleSelectColumn(request.alias, item.value)
          : request.kind === 'order'
            ? store.toggleOrderColumn(request.alias, item.value)
            : store.toggleGroupColumn(request.alias, item.value));
        store.setPickerFilter('');
        return;
      case 'where':
        store.beginWhereValue(request.alias, item.value);
        return;
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (flatItems.length === 0) return;
    // Tab doubles as Down/Up (Shift+Tab) - moves through options rather
    // than leaving the picker, since it has nowhere else useful to go.
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      setHighlighted(h => (h + 1) % flatItems.length);
      return;
    }
    if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      setHighlighted(h => (h - 1 + flatItems.length) % flatItems.length);
      return;
    }
    // ',' doubles as Enter - select/order/group stay open for repeat picks
    // (see onSelect above), and Pine's own select/order syntax already
    // separates columns with commas, so typing "id,name,email" picks all
    // three without reaching for Enter between each one.
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const item = flatItems[highlighted] ?? flatItems[0];
      if (item) onSelect(item);
    }
  };

  return (
    <div ref={rootRef} style={anchoredStyle(picker.anchor)} data-testid="canvas-picker">
      <div style={headerStyle}>
        <input
          autoFocus
          placeholder="filter..."
          value={picker.filter}
          onChange={e => {
            const value = e.target.value;
            if (picker.request.kind === 'select' && value === '*') {
              const allColumns = picker.groups.flatMap(g => g.items.map(i => i.value));
              void store.commitSelectColumns(picker.request.alias, allColumns);
              store.setPickerFilter('');
              return;
            }
            store.setPickerFilter(value);
          }}
          onKeyDown={onListKeyDown}
          style={{ ...inputStyle, flex: 1 }}
        />
        <span
          style={{ cursor: 'pointer', opacity: 0.7, marginLeft: 6 }}
          onClick={() => store.closePicker()}
        >
          &times;
        </span>
      </div>
      <div className="styled-scrollbar" style={bodyStyle}>
        {picker.loading && <div style={{ opacity: 0.7 }}>loading...</div>}
        {picker.error && <div style={{ color: 'var(--canvas-warn)' }}>{picker.error}</div>}
        {!picker.loading &&
          !picker.error &&
          picker.groups.map(group => {
            const items = sinkSelected(filterItems(group.items, picker.filter), selectedColumns);
            if (items.length === 0) return null;
            return (
              <div key={group.label || 'default'} style={{ marginBottom: 6 }}>
                {group.label && (
                  // Sticky within the scrolling body (not the whole panel,
                  // which no longer scrolls as one piece - see bodyStyle) -
                  // scrolling through a long "has" section still shows which
                  // section you're in. The left accent (groupAccent) carries
                  // the actual has/belongs-to distinction; this replaces an
                  // earlier alternating background tint that separated
                  // groups visually without the color meaning anything.
                  <div
                    style={{
                      position: 'sticky',
                      top: 0,
                      background: 'var(--canvas-picker-bg)',
                      borderLeft: `3px solid ${groupAccent(group.label)}`,
                      paddingLeft: 6,
                      paddingTop: 2,
                      fontSize: '9px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: 'var(--canvas-text-dim)',
                      marginBottom: 3,
                      paddingBottom: 2,
                      borderBottom: '1px solid var(--canvas-node-border)',
                    }}
                  >
                    {group.label}
                  </div>
                )}
                {items.map(item => {
                  // Not a shared `let` counter incremented per iteration -
                  // every onMouseEnter closure below would capture the SAME
                  // mutable binding and read whatever it ended up as once the
                  // render loop finished (i.e. the last item's index), which
                  // is exactly why hovering any row was highlighting/selecting
                  // the last one. Look up each item's own flat position instead.
                  const flatIdx = flatItems.findIndex(i => i.id === item.id);
                  const isHighlighted = flatIdx === highlighted;
                  return (
                    <div
                      key={item.id}
                      data-testid={`picker-item-${item.label}`}
                      onClick={() => onSelect(item)}
                      style={{
                        padding: '3px 4px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        borderRadius: 3,
                        background: isHighlighted ? 'var(--canvas-chip-bg)' : 'transparent',
                      }}
                      onMouseEnter={() => setHighlighted(flatIdx)}
                    >
                      <span>
                        {(picker.request.kind === 'select' ||
                          picker.request.kind === 'order' ||
                          picker.request.kind === 'group') &&
                        selectedColumns.includes(item.value)
                          ? '☑ '
                          : ''}
                        {item.label}
                      </span>
                      {item.detail && <span style={{ opacity: 0.5 }}>{item.detail}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
      </div>
    </div>
  );
});

export default Picker;
