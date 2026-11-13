import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
  CanvasTableNode,
  JOIN_TYPES,
  MORE_ACTIONS,
  TRAVERSE_VERBS,
  ORDER_DIRECTIONS,
  PickerAnchor,
  PickerGroup,
  PickerItem,
  RELATIVE_DATE_UNITS,
  RelativeDateUnit,
  WHERE_OPERATORS,
  WHERE_ROLLING_OPERATOR,
  WHERE_TODAY_OPERATOR,
} from '../../store/canvas/canvas.model';
import { looksLikeDateColumn } from '../../store/canvas/relative-date';
import { selectName } from '../../store/canvas/pine-actions';
import { fuzzyFilter } from '../../store/canvas/fuzzy';
import { filterGroups } from '../../store/canvas/picker-filter';
import { useCanvasStore } from './canvas-context';

const pluralize = (count: number, unit: string): string => (count === 1 ? unit : `${unit}s`);

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
  fontSize: 'calc(13px * var(--text-scale, 1))',
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
const bodyPaddingTop = 6;
const bodyStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  padding: `${bodyPaddingTop}px 8px 8px 8px`,
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

// A panel action: a real <button> so it takes focus, drawn as the plain text
// link the panels have always used.
const actionStyle: React.CSSProperties = {
  font: 'inherit',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  color: 'inherit',
};

/**
 * Tab and Shift+Tab move through the panel's own controls in `data-tab-order`
 * order and wrap, instead of leaving the panel for whatever is next on the
 * page (the Pine panel, typically). The panel is a popover: what a keyboard
 * user wants from Tab is the next thing in it, and Escape is the way out.
 */
const cycleTabOrder = (e: React.KeyboardEvent<HTMLElement>) => {
  if (e.key !== 'Tab') return;
  const order = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-tab-order]')).sort(
    (a, b) => Number(a.dataset.tabOrder) - Number(b.dataset.tabOrder),
  );
  if (order.length === 0) return;
  e.preventDefault();
  const at = order.indexOf(document.activeElement as HTMLElement);
  const next = at === -1 ? 0 : (at + (e.shiftKey ? -1 : 1) + order.length) % order.length;
  order[next].focus();
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
  if (anchor.above) {
    // Grows upward from just above the anchor, as tall as fits.
    const bottom = Math.max(vh - anchor.y + margin, margin);
    return { ...basePickerStyle, left, bottom, maxHeight: Math.min(pickerHeight, vh - bottom - margin) };
  }
  const top = Math.min(Math.max(anchor.y + margin, margin), vh - pickerHeight - margin);
  return { ...basePickerStyle, left, top };
};


/** Already-selected columns sink to the bottom - they're done, so the columns still worth picking stay up top. */
const sinkSelected = (
  items: PickerItem[],
  selectedColumns: string[],
  key: (item: PickerItem) => string,
): PickerItem[] => {
  if (selectedColumns.length === 0) return items;
  const unselected = items.filter(i => !selectedColumns.includes(key(i)));
  const selected = items.filter(i => selectedColumns.includes(key(i)));
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

  // Keep the open popover inside the window. Its position is worked out
  // from a fixed size estimate (anchoredStyle), and some panels are larger
  // than that - the limit editor with its `per` field - so after each render
  // it is measured and moved back in by however much it overflows.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    const dx = Math.max(rect.right - (window.innerWidth - margin), 0);
    // A picker that opens upward (anchor.above) is placed by its bottom, and only its left needs fixing.
    const dy = el.style.bottom ? 0 : Math.max(rect.bottom - (window.innerHeight - margin), 0);
    if (dx) el.style.left = `${Math.max(rect.left - dx, margin)}px`;
    if (dy) el.style.top = `${Math.max(rect.top - dy, margin)}px`;
  });

  // Computed unconditionally (rather than after the where-value early
  // return below) so `flatItems` can already sink selected columns to the
  // bottom - keyboard nav and the rendered rows must agree on one order.
  // Covers 'select', 'order' and 'group' - the picker kinds that stay open
  // for repeat picks and therefore need "already picked" reflected in the
  // list.
  // The list holds every table's columns (beamlynx-plans #28), so a picked
  // column is its table and its name: selectedKey.
  let selectedColumns: string[] = [];
  if (
    picker.open &&
    picker.mode === 'list' &&
    (picker.request.kind === 'select' || picker.request.kind === 'order' || picker.request.kind === 'group')
  ) {
    const kind = picker.request.kind;
    const fallback = picker.request.alias;
    const aliases = Array.from(new Set([fallback, ...picker.groups.flatMap(g => g.items.map(i => i.alias ?? fallback))]));
    selectedColumns = aliases.flatMap(alias => store.chipColumns(kind, alias).map(column => `${alias}.${column}`));
  }
  const selectedKey = (item: PickerItem) =>
    `${item.alias ?? (picker.open && picker.mode === 'list' && 'alias' in picker.request ? picker.request.alias : '')}.${item.value}`;
  // A select column can be picked again, for a copy with its own name, so it
  // stays in its place in the list with a count rather than sinking.
  const sunkColumns = picker.open && picker.mode === 'list' && picker.request.kind === 'select' ? [] : selectedColumns;

  // `t.id` or `tenant id` narrows to those tables' columns (picker-filter.ts).
  const filtered = picker.open && picker.mode === 'list' ? filterGroups(picker.groups, picker.filter) : [];
  const shownItems = (g: PickerGroup) =>
    picker.open && picker.mode === 'list'
      ? sinkSelected(filtered[picker.groups.indexOf(g)] ?? [], sunkColumns, selectedKey)
      : [];
  const flatItems: PickerItem[] =
    picker.open && picker.mode === 'list' && !picker.loading && !picker.error ? picker.groups.flatMap(shownItems) : [];
  const flatKey = flatItems.map(i => i.id).join('|');
  const focusValue = picker.open && picker.mode === 'list' ? picker.focusValue : undefined;

  // Reset the highlight whenever a fresh picker opens or the visible set
  // changes (typing narrows the filter, or results finish loading) - to
  // `focusValue`'s own row when CanvasStore.openConfigCursor set one (so
  // Enter immediately toggles that SAME column back off), the top item
  // otherwise.
  useEffect(() => {
    if (focusValue) {
      // A chip reopened from its node: that table's column, when several tables have one by that name.
      const own = picker.open && picker.mode === 'list' && 'alias' in picker.request ? picker.request.alias : undefined;
      const exact = flatItems.findIndex(i => i.value === focusValue && (i.alias === undefined || i.alias === own));
      const idx = exact >= 0 ? exact : flatItems.findIndex(i => i.value === focusValue);
      if (idx >= 0) {
        setHighlighted(idx);
        return;
      }
    }
    setHighlighted(0);
    // flatItems is recomputed every render (a fresh array each time) - keying
    // this off it directly would re-run on every render instead of only
    // when the actual visible set changes; flatKey is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker.open, flatKey, focusValue]);

  // Keeps the highlighted row scrolled into view as ArrowUp/Down/Tab move
  // it (or as the effect above lands it on a specific `focusValue` row that
  // may be well below the fold, sunk to the bottom by sinkSelected) -
  // without this, arrowing past the visible area kept "moving" a selection
  // the scrollable body never actually followed.
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const filterRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = flatItems[highlighted]?.id;
    if (id) itemRefs.current.get(id)?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted, flatKey]);

  // The picker's filter/value input is `autoFocus`ed while open. Closing it
  // (however that happens - a single-pick commit like commitFirstTable,
  // Escape, or the click-outside handler below) removes that input from
  // the DOM while it still holds focus. The resulting native `focusout`
  // has `relatedTarget: null` (nothing else was told to receive focus),
  // which useFocusedPanelTracking.ts correctly reads as "focus left every
  // panel" and clears GlobalStore.focusedPanelId - but with no
  // compensating focus target, GlobalStore.activeKeyboardPanel's fallback
  // then resolves to 'settings' if Settings happens to be open (its own
  // comment admits this is a deliberate, imperfect default), silently
  // killing every canvas keybinding (s/w/o/g/x/u/U/i - see
  // useCanvasKeybindings.ts's guard) until the user clicks the canvas
  // again. Confirmed live: open Settings, run any single-pick gesture
  // (pick a table/join, or submit a where-value), then press a canvas key.
  //
  // Same "component unmounts while focused, the browser's own blur isn't
  // enough" class of bug GlobalStore.hideNewLayoutPanel already had to work
  // around for PineInput/SqlInput (see that function's own comment) - same
  // fix shape: don't rely on the browser doing something useful with focus
  // when the element holding it disappears, proactively move it back to
  // the graph panel root the instant the picker closes. `useEffect`, not
  // `useLayoutEffect` - this is a keyboard-focus correction, not a paint
  // concern, and by the time this runs the input is already gone and
  // focus already fell through to nothing, so there's no earlier point
  // that would do any better.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !picker.open) {
      document.querySelector<HTMLElement>('[data-keyboard-panel="graph"]')?.focus();
    }
    wasOpenRef.current = picker.open;
  }, [picker.open]);

  // Escape closes the picker regardless of what has focus - a per-input
  // onKeyDown only catches it while that specific input is focused, which
  // isn't reliable (e.g. focus lost to the ReactFlow canvas). A window-level
  // listener while the picker is open covers every case with one path.
  useEffect(() => {
    if (!picker.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store.dismissPicker();
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
      // The peek at a JSON value (JsonPeek.tsx) belongs to the picker: its
      // value can be scrolled and selected while the key is typed.
      if (target?.closest('[data-json-peek]')) return;
      store.closePicker();
    };
    window.addEventListener('mousedown', onMouseDown, true);
    return () => window.removeEventListener('mousedown', onMouseDown, true);
  }, [picker.open, store]);

  // Focuses the join-type/more panel's own root div so its onKeyDown below
  // (mnemonics, arrow keys) fires without a click first - the filter/value
  // inputs in every other mode get this via a plain `autoFocus` attribute,
  // which a bare `<div>` doesn't support (it's not natively focusable
  // without a tabIndex, and React only recognizes `autoFocus` on elements
  // that are).
  const focusRootAlias =
    picker.open &&
    (picker.mode === 'join-type' ||
      picker.mode === 'more' ||
      picker.mode === 'traverse' ||
      picker.mode === 'order-direction')
      ? picker.alias
      : null;
  useEffect(() => {
    if (focusRootAlias !== null) rootRef.current?.focus();
  }, [focusRootAlias]);

  if (!picker.open) return null;

  if (picker.mode === 'more') {
    const offered = MORE_ACTIONS.filter(o => picker.offer.includes(o.action));
    return (
      <div
        ref={rootRef}
        tabIndex={-1}
        onKeyDown={e => {
          const match = offered.find(o => o.key === e.key.toLowerCase());
          if (match) {
            e.preventDefault();
            // See the traverse menu below: only on a match, so Escape still
            // reaches the window-level listener.
            e.stopPropagation();
            store.activateMoreAction(picker.alias, match.action, picker.isCheckpoint, picker.anchor);
          }
        }}
        style={{ ...anchoredStyle(picker.anchor), padding: 8, minWidth: 140, maxHeight: 'none' }}
        data-testid="canvas-picker"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {offered.length === 0 && (
            // The operation bar's "+" offers unnest once a table has a JSON column.
            <div style={{ padding: '4px 6px', opacity: 0.6 }}>No table here has a JSON column to unnest.</div>
          )}
          {offered.map(option => (
            <div
              key={option.action}
              data-testid={`more-${option.action}-${picker.alias}`}
              onClick={() => store.activateMoreAction(picker.alias, option.action, picker.isCheckpoint, picker.anchor)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 6px',
                borderRadius: 3,
                cursor: 'pointer',
              }}
            >
              <span>{option.label}</span>
              <span style={{ opacity: 0.5 }}>{option.key}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // The verb menu behind "+" -> traverse. Two fixed entries, so it renders
  // like the "+" menu itself rather than going through the list picker.
  if (picker.mode === 'traverse') {
    const blocked = picker.deleteBlockedReason;
    const activate = (verb: 'count' | 'delete') => {
      if (verb === 'delete' && blocked) return;
      void store.session.startTraversal(verb);
    };
    return (
      <div
        ref={rootRef}
        tabIndex={-1}
        onKeyDown={e => {
          const match = TRAVERSE_VERBS.find(v => v.key === e.key.toLowerCase());
          if (match) {
            e.preventDefault();
            // Only on a match, so Escape still reaches the window-level
            // listener that closes the picker.
            e.stopPropagation();
            activate(match.verb);
          }
        }}
        style={{ ...anchoredStyle(picker.anchor), padding: 8, minWidth: 190, maxHeight: 'none' }}
        data-testid="canvas-picker"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {TRAVERSE_VERBS.map(option => {
            const disabled = option.verb === 'delete' && !!blocked;
            return (
              <div
                key={option.verb}
                data-testid={`traverse-${option.verb}-${picker.alias}`}
                title={disabled ? blocked ?? undefined : undefined}
                onClick={() => activate(option.verb)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '4px 6px',
                  borderRadius: 3,
                  cursor: disabled ? 'default' : 'pointer',
                  opacity: disabled ? 0.45 : 1,
                }}
              >
                <span>{option.label}</span>
                <span style={{ opacity: 0.5 }}>{option.key}</span>
              </div>
            );
          })}
        </div>
        {/* Shown disabled, not hidden: a missing menu entry is a mystery, a
            disabled one with a sentence teaches why deleting along this
            expression would be wrong. See canDeleteTraverse. */}
        {blocked && (
          <div
            data-testid="traverse-delete-blocked"
            style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: '1px solid var(--canvas-node-border)',
              fontSize: 'calc(11px * var(--text-scale, 1))',
              color: 'var(--canvas-text-dim)',
              maxWidth: 260,
              lineHeight: 1.4,
            }}
          >
            {blocked}
          </div>
        )}
      </div>
    );
  }

  if (picker.mode === 'join-type') {
    const node = store.canvasGraph.nodes.find(
      (n): n is CanvasTableNode => n.id === picker.alias && n.type === 'table-node',
    );
    return (
      <div
        ref={rootRef}
        tabIndex={-1}
        onKeyDown={e => {
          const idx = JOIN_TYPES.findIndex(o => o.type === picker.current);
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'Tab') {
            e.preventDefault();
            void store.setJoinType(picker.alias, JOIN_TYPES[(idx + 1) % JOIN_TYPES.length].type);
            return;
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            void store.setJoinType(picker.alias, JOIN_TYPES[(idx - 1 + JOIN_TYPES.length) % JOIN_TYPES.length].type);
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            store.closePicker();
            return;
          }
          // i/l/r mnemonics - safe to bind directly here (unlike a
          // canvas-global letter shortcut) because this popover owns the
          // keyboard exclusively while it's open, the same reason
          // useCanvasKeybindings.ts's whole bare-key layer goes silent
          // whenever any picker (canvasStore.mode !== 'normal') is up.
          const match = JOIN_TYPES.find(o => o.key === e.key.toLowerCase());
          if (match) {
            e.preventDefault();
            void store.setJoinType(picker.alias, match.type);
          }
        }}
        style={{ ...anchoredStyle(picker.anchor), padding: 8, minWidth: 140, maxHeight: 'none' }}
        data-testid="canvas-picker"
      >
        <div
          style={{
            marginBottom: 6,
            opacity: 0.7,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {node?.data.table ?? picker.alias} join
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {JOIN_TYPES.map(option => (
            <div
              key={option.type}
              data-testid={`join-type-${option.type}`}
              onClick={() => void store.setJoinType(picker.alias, option.type)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 6px',
                borderRadius: 3,
                cursor: 'pointer',
                background: option.type === picker.current ? 'var(--canvas-chip-bg)' : 'transparent',
              }}
            >
              <span>{option.label}</span>
              <span style={{ opacity: 0.5 }}>{option.key}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (picker.mode === 'order-direction') {
    const node = store.canvasGraph.nodes.find(
      (n): n is CanvasTableNode => n.id === picker.alias && n.type === 'table-node',
    );
    return (
      <div
        ref={rootRef}
        tabIndex={-1}
        onKeyDown={e => {
          const idx = ORDER_DIRECTIONS.findIndex(o => o.direction === picker.current);
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'Tab') {
            e.preventDefault();
            void store.setOrderDirection(ORDER_DIRECTIONS[(idx + 1) % ORDER_DIRECTIONS.length].direction);
            return;
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            void store.setOrderDirection(
              ORDER_DIRECTIONS[(idx - 1 + ORDER_DIRECTIONS.length) % ORDER_DIRECTIONS.length].direction,
            );
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            store.closePicker();
            return;
          }
          // a/d mnemonics - safe to bind directly here since this popover
          // owns the keyboard exclusively while it's open (see join-type's
          // matching comment above).
          const match = ORDER_DIRECTIONS.find(o => o.key === e.key.toLowerCase());
          if (match) {
            e.preventDefault();
            void store.setOrderDirection(match.direction);
          }
        }}
        style={{ ...anchoredStyle(picker.anchor), padding: 8, minWidth: 140, maxHeight: 'none' }}
        data-testid="canvas-picker"
      >
        <div
          title={`${node?.data.table ?? picker.alias}.${picker.column}`}
          style={{
            marginBottom: 6,
            opacity: 0.7,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {node?.data.table ?? picker.alias}.{picker.column} order
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {ORDER_DIRECTIONS.map(option => (
            <div
              key={option.direction}
              data-testid={`order-direction-${option.direction}`}
              onClick={() => void store.setOrderDirection(option.direction)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 6px',
                borderRadius: 3,
                cursor: 'pointer',
                background: option.direction === picker.current ? 'var(--canvas-chip-bg)' : 'transparent',
              }}
            >
              <span>{option.label}</span>
              <span style={{ opacity: 0.5 }}>{option.key}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <span
            style={{ cursor: 'pointer', color: 'var(--canvas-warn)' }}
            onClick={() => void store.removeOrderAt(picker.alias, picker.index).then(() => store.closePicker())}
          >
            remove
          </span>
        </div>
      </div>
    );
  }

  if (picker.mode === 'unnest-name') {
    return (
      <div
        ref={rootRef}
        style={{ ...anchoredStyle(picker.anchor), padding: 8, maxHeight: 'none' }}
        data-testid="canvas-picker"
      >
        <div style={{ marginBottom: 6, opacity: 0.7 }}>The name of the elements, as in {picker.name}.field</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ opacity: 0.7, fontFamily: 'var(--code-font)' }}>as</span>
          <input
            autoFocus
            data-testid="unnest-name-input"
            placeholder="name"
            value={picker.value}
            onChange={e => store.setSelectNameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void store.commitUnnestName();
              if (e.key === 'Escape') store.closePicker();
            }}
            style={{ ...inputStyle, width: 160 }}
          />
        </div>
        {picker.value.trim() && selectName(picker.value) !== picker.value.trim() && (
          <div style={{ marginTop: 4, opacity: 0.6 }}>
            saved as <code>{selectName(picker.value)}</code>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <span style={{ cursor: 'pointer' }} onClick={() => void store.commitUnnestName()}>
            save
          </span>
        </div>
      </div>
    );
  }

  if (picker.mode === 'select-name') {
    const node = store.canvasGraph.nodes.find(
      (n): n is CanvasTableNode => n.id === picker.alias && n.type === 'table-node',
    );
    return (
      <div
        ref={rootRef}
        style={{ ...anchoredStyle(picker.anchor), padding: 8, maxHeight: 'none' }}
        data-testid="canvas-picker"
      >
        <div style={{ marginBottom: 6, opacity: 0.7 }}>
          {/* An element's item is written as typed: `company.id`. */}
          {picker.element ? picker.column : `${node?.data.table ?? picker.alias}.${picker.column}`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ opacity: 0.7, fontFamily: 'var(--code-font)' }}>as</span>
          <input
            autoFocus
            data-testid="select-name-input"
            placeholder="name"
            value={picker.value}
            onChange={e => store.setSelectNameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void store.commitSelectName();
              if (e.key === 'Escape') store.closePicker();
            }}
            style={{ ...inputStyle, width: 160 }}
          />
        </div>
        {/* What will be written: letters, digits and _ only. */}
        {picker.value.trim() && selectName(picker.value) !== picker.value.trim() && (
          <div data-testid="select-name-preview" style={{ marginTop: 4, opacity: 0.6 }}>
            saved as <code>{selectName(picker.value)}</code>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <span
            style={{ cursor: 'pointer', color: 'var(--canvas-warn)' }}
            onClick={() =>
              void store
                .removeSelectColumn(picker.alias, picker.column, picker.occurrence)
                .then(() => store.closePicker())
            }
          >
            remove
          </span>
          <span style={{ cursor: 'pointer' }} onClick={() => void store.commitSelectName()}>
            save
          </span>
        </div>
      </div>
    );
  }

  if (picker.mode === 'limit-value') {
    return (
      <div
        ref={rootRef}
        style={{ ...anchoredStyle(picker.anchor), padding: 8, maxHeight: 'none' }}
        data-testid="canvas-picker"
      >
        <div style={{ marginBottom: 6, opacity: 0.7 }}>limit</div>
        <input
          autoFocus
          type="number"
          min={1}
          data-testid="limit-value-input"
          value={picker.value}
          onChange={e => store.setLimitValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') void store.submitLimit();
          }}
          style={{ ...inputStyle, width: 80 }}
        />
        {/* Optional: the first N rows of each group of rows sharing these
            columns (pine-lang's `limit: N per ...`). The columns come from
            the tables of the stage this limit ends. */}
        <div style={{ margin: '8px 0 4px', opacity: 0.7 }}>per (optional)</div>
        {picker.per.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4, maxWidth: 220 }}>
            {picker.per.map(column => (
              <span
                key={column}
                data-testid={`limit-per-chip-${column}`}
                style={{
                  padding: '1px 6px',
                  borderRadius: 3,
                  background: 'var(--canvas-chip-bg)',
                  border: '1px solid var(--canvas-chip-border)',
                }}
              >
                {column}{' '}
                <span style={{ cursor: 'pointer', opacity: 0.6 }} onClick={() => store.togglePer(column)}>
                  &times;
                </span>
              </span>
            ))}
          </div>
        )}
        <input
          data-testid="limit-per-input"
          placeholder={picker.perOptions === null ? 'loading…' : 'column'}
          value={picker.perFilter}
          onChange={e => store.setPerFilter(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const first = fuzzyFilter(
                (picker.perOptions ?? []).filter(o => !picker.per.includes(o)),
                picker.perFilter,
                o => o,
              )[0];
              if (picker.perFilter && first) store.togglePer(first);
              else void store.submitLimit();
            }
          }}
          style={{ ...inputStyle, width: 200 }}
        />
        {picker.perFilter && (
          <div style={{ maxHeight: 140, overflowY: 'auto', marginTop: 2 }}>
            {fuzzyFilter(
              (picker.perOptions ?? []).filter(o => !picker.per.includes(o)),
              picker.perFilter,
              o => o,
            )
              .slice(0, 8)
              .map(o => (
                <div
                  key={o}
                  data-testid={`limit-per-option-${o}`}
                  style={{ cursor: 'pointer', padding: '2px 4px' }}
                  onClick={() => store.togglePer(o)}
                >
                  {o}
                </div>
              ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
          <span style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => store.closePicker()}>
            cancel
          </span>
          {picker.current !== null && (
            <span
              style={{ cursor: 'pointer', color: 'var(--canvas-warn)' }}
              onClick={() => void store.clearLimit()}
            >
              clear
            </span>
          )}
          <span style={{ cursor: 'pointer', color: 'var(--canvas-trace)' }} onClick={() => void store.submitLimit()}>
            set
          </span>
        </div>
      </div>
    );
  }

  if (picker.mode === 'where-value') {
    const tableOf = (alias: string) =>
      store.canvasGraph.nodes.find((n): n is CanvasTableNode => n.id === alias && n.type === 'table-node')?.data
        .table ?? alias;
    const single = picker.conditions.length === 1;
    const [first] = picker.conditions;
    const relative = first.operator === WHERE_TODAY_OPERATOR || first.operator === WHERE_ROLLING_OPERATOR;
    const onValueKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') void store.submitWhereValue();
    };
    return (
      <div
        ref={rootRef}
        style={{ ...anchoredStyle(picker.anchor), padding: 8 }}
        data-testid="canvas-picker"
        onKeyDown={cycleTabOrder}
      >
        {picker.conditions.map((condition, row) => {
          const name = `${tableOf(condition.alias)}.${condition.column}`;
          return (
            <React.Fragment key={row}>
              {row > 0 && <div style={{ margin: '6px 0', opacity: 0.6 }}>or</div>}
              <div
                title={name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                  gap: 6,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                {!single && (
                  <button
                    type="button"
                    data-tab-order={1004 + row}
                    aria-label={`Remove ${name}`}
                    onClick={() => store.removeWhereRow(row)}
                    style={{ ...actionStyle, opacity: 0.7 }}
                  >
                    &times;
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Autofocused on the newest row, not the value input --
                    picking the comparison (=, !=, ...) is the first decision
                    here, and it's a <select> a keyboard user can immediately
                    arrow through. For a brand-new, single condition on a
                    date-shaped column, two extra entries (today / in the
                    last) turn the row after this one into a relative-date
                    builder instead of a plain value input - see
                    CanvasStore.submitWhereValue's own comment for why these
                    live on the operator itself rather than a separate mode. */}
                <select
                  autoFocus={row === picker.conditions.length - 1}
                  data-tab-order={10 + row * 10}
                  value={condition.operator}
                  onChange={e => store.setWhereOperator(row, e.target.value)}
                  style={{ ...inputStyle, paddingRight: 4 }}
                >
                  {WHERE_OPERATORS.map(op => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                  {single && picker.editIndex === undefined && looksLikeDateColumn(condition.column) && (
                    <>
                      <option value={WHERE_TODAY_OPERATOR}>{WHERE_TODAY_OPERATOR}</option>
                      <option value={WHERE_ROLLING_OPERATOR}>{WHERE_ROLLING_OPERATOR}</option>
                    </>
                  )}
                </select>
                {condition.operator === WHERE_TODAY_OPERATOR ? null : condition.operator === WHERE_ROLLING_OPERATOR ? (
                  <>
                    <input
                      type="number"
                      min={1}
                      data-tab-order={11}
                      value={picker.rollingCount}
                      onChange={e =>
                        store.setWhereRolling(Math.max(1, Number(e.target.value) || 1), picker.rollingUnit)
                      }
                      onKeyDown={onValueKeyDown}
                      style={{ ...inputStyle, width: 44 }}
                    />
                    <select
                      data-tab-order={12}
                      value={picker.rollingUnit}
                      onChange={e => store.setWhereRolling(picker.rollingCount, e.target.value as RelativeDateUnit)}
                      style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                    >
                      {RELATIVE_DATE_UNITS.map(u => (
                        <option key={u.value} value={u.value}>
                          {pluralize(picker.rollingCount, u.label)}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <input
                    data-tab-order={11 + row * 10}
                    data-testid={`where-value-input-${row}`}
                    value={condition.value}
                    placeholder="value, or $variable"
                    onChange={e => store.setWhereValue(row, e.target.value)}
                    onKeyDown={onValueKeyDown}
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  />
                )}
              </div>
              {/* A value starting with `$` is a variable: the tab's own are
                  offered. A new name gets a `$name = ` line in the values
                  block when the condition is added. */}
              {condition.value.startsWith('$') &&
                (() => {
                  const names = fuzzyFilter(
                    store.variableNames.filter(n => `$${n}` !== condition.value),
                    condition.value.slice(1),
                    n => n,
                  );
                  const isNew = /^\$[A-Za-z_][A-Za-z0-9_]*$/.test(condition.value) && !store.variableNames.includes(condition.value.slice(1));
                  return (
                    <div style={{ marginTop: 2, fontSize: 'calc(11px * var(--text-scale, 1))' }}>
                      {names.slice(0, 6).map(n => (
                        <div
                          key={n}
                          data-testid={`where-variable-${n}`}
                          style={{ cursor: 'pointer', padding: '2px 4px', color: 'var(--canvas-trace)' }}
                          onClick={() => store.setWhereValue(row, `$${n}`)}
                        >
                          ${n}
                        </div>
                      ))}
                      {isNew && <div style={{ padding: '2px 4px', opacity: 0.7 }}>new variable: adds {condition.value} = to the values block</div>}
                    </div>
                  );
                })()}
            </React.Fragment>
          );
        })}
        {/* Real buttons, so they take focus. Tab order is set by
            data-tab-order (see cycleTabOrder), not by position: the primary
            action comes straight after the last value, while the row reads
            left to right the way it always has. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginTop: 6 }}>
          <span>
            {!relative && (
              <button
                type="button"
                data-tab-order={1001}
                title="Match this condition or another one"
                onClick={() => store.addWhereOrCondition()}
                style={{ ...actionStyle, color: 'var(--canvas-trace)' }}
              >
                + or
              </button>
            )}
          </span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button type="button" data-tab-order={1002} onClick={() => store.closePicker()} style={{ ...actionStyle, opacity: 0.7 }}>
              cancel
            </button>
            {picker.editIndex !== undefined && single && !relative && first.value.trim() && !first.value.trim().startsWith('$') && (
              <button
                type="button"
                data-tab-order={1005}
                data-testid="where-make-variable"
                title="Move this value into the values block, as a $variable"
                onClick={() => void store.makeWhereVariable()}
                style={{ ...actionStyle, color: 'var(--canvas-trace)' }}
              >
                make variable
              </button>
            )}
            {picker.editIndex !== undefined && (
              <button
                type="button"
                data-tab-order={1003}
                onClick={() => void store.removeWhereAndClose(picker.alias, picker.editIndex as number)}
                style={{ ...actionStyle, color: 'var(--canvas-warn)' }}
              >
                remove
              </button>
            )}
            <button
              type="button"
              data-tab-order={1000}
              onClick={() => void store.submitWhereValue()}
              style={{ ...actionStyle, color: 'var(--canvas-trace)' }}
            >
              {picker.editIndex !== undefined ? 'update' : 'add'}
            </button>
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
        // A column picker lists every table's columns: the pick is written
        // for the item's own table, so its chip lands on that node.
        void (request.kind === 'select'
          ? store.addSelectColumn(item.alias ?? request.alias, item.value)
          : request.kind === 'order'
            ? store.toggleOrderColumn(item.alias ?? request.alias, item.value)
            : store.toggleGroupColumn(item.alias ?? request.alias, item.value));
        store.setPickerFilter('');
        return;
      case 'where':
        store.beginWhereValue(item.alias ?? request.alias, item.value, request.draft);
        return;
      case 'unnest':
        void store.commitUnnest(item.alias ?? request.alias, item.value);
        return;
      // Step 1: `item.value` here is a bare table name (not h.pine - see
      // openPathPicker), naming the destination for step 2 to search
      // routes to. Doesn't commit anything itself.
      case 'path':
        store.openPathRoutePicker(request.alias, item.value, item.detail, picker.anchor);
        return;
      // Step 2: item.value IS a full (possibly multi-hop) pine fragment -
      // asTableHint reconstructs a committable hint from it exactly like
      // any single-hop join candidate (see openPathRoutePicker).
      case 'path-route':
        void store.commitJoin(asTableHint(item), request.alias);
        return;
    }
  };

  // A JSON column's keys aren't in the schema, so its › (or Right on its
  // row) starts typing a path inside it: the filter becomes `data.`, and
  // what is typed next becomes a "nested" item (CanvasStore.setPickerFilter).
  // The click lands on the row, so the focus is put back in the filter,
  // with the caret after the dot, ready for the key.
  const startPath = (item: PickerItem) => {
    store.setPickerFilter(`${item.value}.`);
    requestAnimationFrame(() => {
      const input = filterRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  };
  const jsonItems = picker.groups.flatMap(g => g.items.filter(i => i.json));
  // `data.` typed, or just opened with ›: say what to type next.
  const pathStart = jsonItems.find(i => picker.filter === `${i.value}.`);

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      const item = flatItems[highlighted];
      const input = e.target as HTMLInputElement;
      if (item?.json && input.selectionStart === input.value.length) {
        e.preventDefault();
        startPath(item);
      }
      return;
    }
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
          ref={filterRef}
          autoFocus
          placeholder={
            picker.request.kind === 'unnest'
              ? 'column, or a path: options.officers'
              : jsonItems.length
                ? `filter, or ${jsonItems[0].value}.key`
                : 'filter...'
          }
          value={picker.filter}
          onChange={e => {
            const value = e.target.value;
            if (picker.request.kind === 'select' && value === '*') {
              // Every column of the table the picker started from.
              const own = picker.request.alias;
              const allColumns = picker.groups.flatMap(g =>
                g.items.filter(i => (i.alias ?? own) === own).map(i => i.value),
              );
              void store.commitSelectColumns(own, allColumns);
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
          onClick={() => store.dismissPicker()}
        >
          &times;
        </span>
      </div>
      <div className="styled-scrollbar" style={bodyStyle}>
        {picker.loading && <div style={{ opacity: 0.7 }}>loading...</div>}
        {picker.error && <div style={{ color: 'var(--canvas-warn)' }}>{picker.error}</div>}
        {pathStart && (
          <div data-testid="picker-path-hint" style={{ opacity: 0.6, padding: '3px 4px' }}>
            type a key inside {pathStart.value}, like <code>{pathStart.value}.name</code> or{' '}
            <code>{pathStart.value}.tags[0]</code>
          </div>
        )}
        {!picker.loading &&
          !picker.error &&
          picker.groups.map(group => {
            const items = shownItems(group);
            if (items.length === 0) return null;
            return (
              <div key={group.alias ?? (group.label || 'default')} style={{ marginBottom: 6 }}>
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
                      // The body's top padding (bodyStyle): at 0 it stuck
                      // below that padding, and rows scrolled past showed
                      // through the gap above it.
                      top: -bodyPaddingTop,
                      // Without an explicit stacking order, this sticky
                      // header (earlier in the DOM than the items below it)
                      // can still paint BEHIND those items once scrolling
                      // makes them overlap it - later same-stacking-context
                      // siblings paint on top of earlier ones by default.
                      // The symptom was exactly "HAS" not looking pinned at
                      // the top: the tail of whatever scrolled past showed
                      // through the sliver of the header its own background
                      // should have covered.
                      zIndex: 1,
                      // A table's heading, `user (u)`, sits on the chip
                      // tint in the accent colour: dim text read as one
                      // more column. Its columns are indented below.
                      background: group.alias ? 'var(--canvas-chip-bg)' : 'var(--canvas-picker-bg)',
                      borderLeft: `3px solid ${group.alias ? 'var(--canvas-trace)' : groupAccent(group.label)}`,
                      paddingLeft: 6,
                      paddingTop: 2,
                      fontSize: 'calc(11px * var(--text-scale, 1))',
                      fontWeight: 700,
                      // A table's heading is a name: an alias is case-sensitive.
                      textTransform: group.alias ? 'none' : 'uppercase',
                      letterSpacing: '0.5px',
                      color: group.alias ? 'var(--canvas-trace)' : 'var(--canvas-text-dim)',
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
                      ref={el => {
                        if (el) itemRefs.current.set(item.id, el);
                        else itemRefs.current.delete(item.id);
                      }}
                      data-testid={`picker-item-${item.label}`}
                      onClick={() => onSelect(item)}
                      style={{
                        // Under a table's heading, indented: a column of that table.
                        padding: group.alias && group.label ? '3px 4px 3px 14px' : '3px 4px',
                        cursor: 'pointer',
                        borderRadius: 3,
                        // The Pine panel's selected completion has the same
                        // colours (globals.css): the chip tint is the
                        // headings', so a row in it didn't read as selected.
                        background: isHighlighted ? 'var(--primary-color)' : 'transparent',
                        color: isHighlighted ? 'var(--primary-text-color)' : undefined,
                      }}
                      onMouseEnter={() => setHighlighted(flatIdx)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>
                          {(picker.request.kind === 'order' || picker.request.kind === 'group') &&
                          selectedColumns.includes(selectedKey(item))
                            ? '☑ '
                            : ''}
                          {item.label}
                          {picker.request.kind === 'select' && selectedColumns.includes(selectedKey(item)) && (
                            <span
                              data-testid={`picker-count-${item.label}`}
                              title="Already selected. Pick it again to add a copy with its own name."
                              style={{ opacity: 0.5, marginLeft: 6 }}
                            >
                              ×{selectedColumns.filter(c => c === selectedKey(item)).length}
                            </span>
                          )}
                        </span>
                        {item.detail && <span style={{ opacity: 0.5 }}>{item.detail}</span>}
                        {item.json && (
                          <span
                            data-testid={`picker-path-${item.label}`}
                            title={`A key inside ${item.label} (→)`}
                            // Keeps the focus in the filter, where the key is typed.
                            onMouseDown={e => e.preventDefault()}
                            onClick={e => {
                              e.stopPropagation();
                              startPath(item);
                            }}
                            style={{ opacity: isHighlighted ? 0.9 : 0.45, padding: '0 4px', fontFamily: 'var(--code-font)' }}
                          >
                            {'{ } ›'}
                          </span>
                        )}
                      </div>
                      {/* Only rendered for a join candidate that shares its
                          table with another candidate in the same group -
                          see openJoinPicker's toItems. An unambiguous row
                          never grows this second line. `.column` is Pine's
                          own disambiguation-hint syntax (docs/joins.md in
                          pine-lang, e.g. `employee | document .created_by`),
                          not UI-invented wording - this is exactly what
                          picking this row is equivalent to typing by hand. */}
                      {item.columnHint && (
                        <div
                          style={{
                            fontSize: 'calc(11px * var(--text-scale, 1))',
                            color: 'var(--canvas-text-dim)',
                            fontFamily: 'var(--code-font)',
                          }}
                        >
                          .{item.columnHint}
                        </div>
                      )}
                      {/* Only set for a path-route item whose destination is
                          reachable more than one way (openPathRoutePicker) -
                          same role as columnHint above (distinguishing rows
                          that would otherwise render identically), just
                          plain text rather than a Pine `.column` fragment. */}
                      {item.subLabel && (
                        <div
                          style={{
                            fontSize: 'calc(11px * var(--text-scale, 1))',
                            color: 'var(--canvas-text-dim)',
                          }}
                        >
                          {item.subLabel}
                        </div>
                      )}
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
