import {
  CompactSelection,
  DataEditor,
  GridCellKind,
  type DataEditorRef,
  type DrawHeaderCallback,
  type EditableGridCell,
  type GetRowThemeCallback,
  type GridCell,
  type GridColumn,
  type GridKeyEventArgs,
  type GridMouseEventArgs,
  type GridSelection,
  type Item,
  type ProvideEditorCallback,
  type TextCell,
} from '@glideapps/glide-data-grid';
import { Code } from '@mui/icons-material';
import { IconButton, Tooltip } from '@mui/material';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStores } from '../../store/store-container';
import type { Row } from '../../store/session';
import { parseJsonCellValue } from '../json-cell.util';
import {
  BASE_HEADER_HEIGHT,
  BASE_ROW_HEIGHT,
  resolveGridTheme,
  withAlpha,
  type ResolvedGridTheme,
} from './grid-theme';
import { prefersReducedMotion } from '../../styles/motion';

// The saved-cell glow: starts at this much accent and fades to nothing.
const FLASH_ALPHA = 0.32;
const FLASH_MS = 1600;
// Under reduced motion it holds, unfaded, for this long instead.
const FLASH_STILL_MS = 900;

/**
 * The results grid. A canvas grid (Glide Data Grid) behind props of our own,
 * so nothing else in the app knows which library draws it.
 *
 * Why a canvas: it draws only the cells in view, so its cost does not grow
 * with the number of rows, the number of columns or the pixel density, and
 * a resize is one redraw rather than a React re-render of every cell. See
 * beamlynx-plans' completed/2026-09-19-evaluate-results-grid-library.md for
 * the measurements that chose it.
 */

export interface ResultsGridColumn {
  /** The key this column's values sit under in every row. */
  field: string;
  title: string;
  width: number;
  /** Values are JSON: shown on one line, opened in the JSON panel on click, never edited inline. */
  json: boolean;
  editable: boolean;
  /**
   * Why this column's values can't be changed, when they can't: shown the
   * moment someone tries (double-click, Enter or typing), instead of an
   * editor that could only fail.
   */
  readOnlyReason?: string;
  /**
   * Why one cell can't be changed, when that depends on its row: a key
   * inside a JSON column can be missing in one row and hold an object in
   * another.
   */
  cellReadOnlyReason?: (row: Row) => string | undefined;
  /** Header background, for the per-table "Table colors" tint and the canvas hover spotlight. */
  headerColor?: string;
  /** This column's table is the one hovered on the canvas. */
  spotlight?: boolean;
}

export interface ResultsGridProps {
  columns: ResultsGridColumn[];
  rows: Row[];
  /** A column's width was dragged to a new size (once, at the end of the drag). */
  onColumnResize: (field: string, width: number) => void;
  onJsonOpen: (row: Row, field: string) => void;
  /** Enter in the cell editor. */
  onCommitEdit: (row: Row, field: string, value: string) => void;
  /** The cell editor's Inspect button: show the update instead of running it. */
  onInspectEdit: (row: Row, field: string, value: string) => void;
  onCellContextMenu: (row: Row, field: string, x: number, y: number) => void;
  /** Someone tried to edit a cell in a column with a readOnlyReason. */
  onReadOnlyEdit: (reason: string) => void;
  /**
   * A cell whose value was just saved: it glows briefly in the accent color,
   * which is the confirmation. `token` restarts the glow for a second save
   * of the same cell.
   */
  flash?: { rowIndex: number; field: string; token: number } | null;
}

const NO_SELECTION: GridSelection = {
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
};

const GRID_KEYBINDINGS = { paste: false, cut: false, delete: false } as const;
const refuse = () => false as const;
const onlySingleCellEdits = (edits: readonly unknown[]) => edits.length !== 1;

// Objects (a JSON column the sampler didn't recognise, say because its first
// rows were null) as JSON, not "[object Object]".
const displayText = (value: unknown): string =>
  value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);

// Glide renders its cell editor into an element with this id. Created once,
// on first use, rather than asking every page to remember to include it.
function ensurePortal() {
  if (typeof document === 'undefined' || document.getElementById('portal')) return;
  const el = document.createElement('div');
  el.id = 'portal';
  el.style.cssText = 'position: fixed; left: 0; top: 0; z-index: 9999;';
  document.body.appendChild(el);
}

/**
 * Canvas text cannot pick up a theme change or a font that finishes loading
 * later, so the theme is re-read after either: after the frame in which
 * pages/_app.tsx writes the new CSS variables, and again once the grid's own
 * font is loaded.
 *
 * "Its own font" has to be asked for explicitly. A browser downloads a web
 * font only when something on the page renders text in it, and a canvas
 * doesn't count. With nothing else using the code font (the Pine panel
 * closed, say), `document.fonts.ready` resolves with the font never
 * requested, and the grid would draw in the fallback forever. So both
 * weights the grid draws with (400 cells, 600 headers) are loaded by name.
 */
function useGridTheme(): ResolvedGridTheme | null {
  const { global } = useStores();
  const [resolved, setResolved] = useState<ResolvedGridTheme | null>(null);
  const { themeId, codeFontFamily, textSize } = global;
  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      if (!cancelled) setResolved(resolveGridTheme());
    };
    const frame = requestAnimationFrame(() => {
      apply();
      const { theme } = resolveGridTheme();
      const family = theme.fontFamily;
      if (!family || !document.fonts) return;
      Promise.all(
        [theme.baseFontStyle, theme.headerFontStyle].map(style =>
          document.fonts.load(`${style} ${family}`).catch(() => []),
        ),
      ).then(apply);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [themeId, codeFontFamily, textSize]);
  return resolved;
}

const ResultsGrid: React.FC<ResultsGridProps> = observer(props => {
  const { columns, rows } = props;
  const resolved = useGridTheme();
  const gridRef = useRef<DataEditorRef>(null);

  // Callbacks read the latest props through a ref, so the memoized pieces
  // handed to the grid below do not change identity on every render.
  const latest = useRef(props);
  latest.current = props;

  useEffect(ensurePortal, []);

  // Widths while a column is being dragged. Committed to the parent once, on
  // release, so a drag re-renders only this component.
  const [dragWidths, setDragWidths] = useState<Record<string, number>>({});

  const [selection, setSelection] = useState<GridSelection>(NO_SELECTION);
  // A value just committed from the cell editor, shown in its cell until the
  // re-run that follows every edit replaces the rows. Without it the cell
  // flicks back to its old value for the length of that round trip.
  const pendingEdits = useRef(new Map<string, string>());
  // A new result: whatever was selected, or pending, refers to rows that are gone.
  useEffect(() => {
    setSelection(NO_SELECTION);
    pendingEdits.current.clear();
  }, [rows]);

  // One cell is focus, not a selection: it gets the accent ring (the
  // keyboard's cursor) but no fill. A range is a real selection, and fills.
  const current = selection.current;
  const isRange =
    selection.rows.length > 0 ||
    selection.columns.length > 0 ||
    (!!current &&
      (current.range.width > 1 || current.range.height > 1 || current.rangeStack.length > 0));
  const theme = useMemo(
    () => (resolved && !isRange ? { ...resolved.theme, accentLight: 'transparent' } : resolved?.theme),
    [resolved, isRange],
  );

  // Leaving the grid clears its selection, so a ring never lingers on a cell
  // you have stopped looking at. Focus moving into the cell editor (rendered
  // in #portal, outside this element) is not leaving, and neither is the
  // whole window losing focus: switching apps and back keeps your place.
  const onBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (!next) {
      if (!document.hasFocus()) return;
    } else if (e.currentTarget.contains(next) || document.getElementById('portal')?.contains(next)) {
      return;
    }
    setSelection(NO_SELECTION);
  }, []);

  const gridColumns = useMemo<GridColumn[]>(
    () =>
      columns.map(c => ({
        id: c.field,
        title: c.title,
        width: dragWidths[c.field] ?? c.width,
        ...(c.headerColor && {
          themeOverride: {
            bgHeader: c.headerColor,
            bgHeaderHovered: c.headerColor,
            bgHeaderHasFocus: c.headerColor,
          },
        }),
      })),
    [columns, dragWidths],
  );

  // The glow lives in a ref and only its one cell is redrawn each frame, so
  // the animation never re-renders React.
  const flashState = useRef<{ rowIndex: number; field: string; alpha: number; color: string } | null>(
    null,
  );
  const { flash } = props;
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;
  useEffect(() => {
    const color = resolvedRef.current?.trace;
    if (!flash || !color) return;
    const col = latest.current.columns.findIndex(c => c.field === flash.field);
    if (col < 0) return;
    const cell: Item = [col, flash.rowIndex];
    const redraw = () => gridRef.current?.updateCells([{ cell }]);
    // The save's re-run may have moved the row: bring it into view.
    gridRef.current?.scrollTo(col, flash.rowIndex, 'both');
    flashState.current = { rowIndex: flash.rowIndex, field: flash.field, alpha: FLASH_ALPHA, color };
    redraw();

    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      flashState.current = null;
      redraw();
    };
    if (prefersReducedMotion()) {
      timer = setTimeout(end, FLASH_STILL_MS);
    } else {
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / FLASH_MS);
        // Ease out: most of the fade happens late, so the glow is seen.
        const remaining = 1 - t * t * t;
        if (t >= 1 || !flashState.current) return end();
        flashState.current.alpha = FLASH_ALPHA * remaining;
        redraw();
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }
    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      flashState.current = null;
    };
    // Keyed on the token: a new save restarts it, a re-render doesn't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash?.token]);

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const column = columns[col];
      const value = rows[row]?.[column.field];
      if (column.json) {
        const parsed = parseJsonCellValue(value);
        const text = parsed === undefined ? displayText(value) : JSON.stringify(parsed);
        return {
          kind: GridCellKind.Text,
          data: text,
          displayData: text,
          allowOverlay: false,
          readonly: true,
          ...(parsed !== undefined && { cursor: 'pointer' }),
        };
      }
      const text = pendingEdits.current.get(`${row}:${column.field}`) ?? displayText(value);
      const glow = flashState.current;
      const editable = column.editable && !(rows[row] && column.cellReadOnlyReason?.(rows[row]));
      return {
        kind: GridCellKind.Text,
        data: text,
        displayData: text,
        allowOverlay: editable,
        readonly: !editable,
        ...(glow && glow.rowIndex === row && glow.field === column.field && glow.alpha > 0 && {
          themeOverride: { bgCell: withAlpha(glow.color, glow.alpha) },
        }),
      };
    },
    [columns, rows],
  );

  // Row hover highlight. The hovered row lives in a ref and only the two rows
  // that changed are redrawn, so moving the pointer never re-renders React.
  const hoverRow = useRef<number | null>(null);
  const getRowThemeOverride = useCallback<GetRowThemeCallback>(
    row => (row === hoverRow.current && resolved ? { bgCell: resolved.theme.bgCellMedium } : undefined),
    [resolved],
  );
  const onItemHovered = useCallback((args: GridMouseEventArgs) => {
    const next = args.kind === 'cell' ? args.location[1] : null;
    const prev = hoverRow.current;
    if (next === prev) return;
    hoverRow.current = next;
    const damaged: { cell: Item }[] = [];
    const count = latest.current.columns.length;
    for (const r of [prev, next]) {
      if (r === null) continue;
      for (let c = 0; c < count; c++) damaged.push({ cell: [c, r] });
    }
    gridRef.current?.updateCells(damaged);
  }, []);

  // The hover spotlight's accent line along the top of a header, drawn over
  // the tinted background (the old grid's inset box-shadow).
  const drawHeader = useCallback<DrawHeaderCallback>(
    (args, drawContent) => {
      drawContent();
      if (!columns[args.columnIndex]?.spotlight || !resolved) return;
      args.ctx.fillStyle = resolved.trace;
      args.ctx.fillRect(args.rect.x, args.rect.y, args.rect.width, 2);
    },
    [columns, resolved],
  );

  // The cell editor: an input plus an Inspect button that opens the update
  // dialog instead of committing. Glide hands a custom editor only the
  // cell's value, so which cell it is comes from the selection, which is
  // controlled here for that reason (and has to be: passing
  // onGridSelectionChange without gridSelection makes Glide stop tracking
  // selection itself, which silently disables editing).
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const provideEditor = useCallback<ProvideEditorCallback<GridCell>>(cell => {
    if (cell.kind !== GridCellKind.Text) return undefined;
    const Editor = (editorProps: {
      value: GridCell;
      onChange: (value: GridCell) => void;
      onFinishedEditing: (value?: GridCell) => void;
    }) => {
      const value = editorProps.value as TextCell;
      const inspect = () => {
        const at = selectionRef.current.current?.cell;
        const { rows: currentRows, columns: currentColumns, onInspectEdit } = latest.current;
        if (at) onInspectEdit(currentRows[at[1]], currentColumns[at[0]].field, value.data);
        editorProps.onFinishedEditing(undefined);
      };
      return (
        <div data-results-cell-editor style={{ display: 'flex', alignItems: 'center', minWidth: 200, gap: 4 }}>
          <input
            autoFocus
            value={value.data}
            onChange={e => editorProps.onChange({ ...value, data: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                editorProps.onFinishedEditing(value);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                editorProps.onFinishedEditing(undefined);
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'inherit',
              font: 'inherit',
            }}
          />
          <Tooltip title="Inspect Update (opens update modal)">
            <IconButton
              size="small"
              onClick={inspect}
              aria-label="Inspect update"
              sx={{
                borderRadius: '4px',
                backgroundColor: 'var(--canvas-node-bg)',
                border: '1px solid var(--canvas-node-border)',
                color: 'var(--canvas-trace)',
                '&:hover': { backgroundColor: 'var(--canvas-chip-bg)' },
                width: 24,
                height: 24,
              }}
            >
              <Code fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      );
    };
    return Editor;
  }, []);

  const onCellEdited = useCallback(([col, row]: Item, value: EditableGridCell) => {
    if (value.kind !== GridCellKind.Text) return;
    const { rows: currentRows, columns: currentColumns, onCommitEdit } = latest.current;
    const field = currentColumns[col].field;
    if (value.data === displayText(currentRows[row]?.[field])) return;
    pendingEdits.current.set(`${row}:${field}`, value.data);
    gridRef.current?.updateCells([{ cell: [col, row] }]);
    onCommitEdit(currentRows[row], field, value.data);
  }, []);

  // An edit attempt on a column that can't be changed says why, straight
  // away. Glide activates a cell on double-click or Enter whether or not it
  // can open an editor; typing only reaches onKeyDown.
  const reasonFor = ([col, row]: Item): string | undefined => {
    const column = latest.current.columns[col];
    if (!column || column.json) return undefined;
    const target = latest.current.rows[row];
    return column.readOnlyReason ?? (target ? column.cellReadOnlyReason?.(target) : undefined);
  };
  const onCellActivated = useCallback((item: Item) => {
    const reason = reasonFor(item);
    if (reason) latest.current.onReadOnlyEdit(reason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onKeyDown = useCallback((event: GridKeyEventArgs) => {
    if (!event.location || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
    const reason = reasonFor(event.location);
    if (reason) latest.current.onReadOnlyEdit(reason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCellClicked = useCallback(([col, row]: Item) => {
    const { rows: currentRows, columns: currentColumns, onJsonOpen } = latest.current;
    const column = currentColumns[col];
    if (!column?.json) return;
    const target = currentRows[row];
    if (target && parseJsonCellValue(target[column.field]) !== undefined) onJsonOpen(target, column.field);
  }, []);

  const onCellContextMenu = useCallback(
    ([col, row]: Item, event: { preventDefault: () => void; bounds: { x: number; y: number }; localEventX: number; localEventY: number }) => {
      event.preventDefault();
      const { rows: currentRows, columns: currentColumns, onCellContextMenu: open } = latest.current;
      const target = currentRows[row];
      if (!target) return;
      open(target, currentColumns[col].field, event.bounds.x + event.localEventX, event.bounds.y + event.localEventY);
    },
    [],
  );

  const onColumnResize = useCallback((column: GridColumn, width: number) => {
    setDragWidths(prev => ({ ...prev, [column.id as string]: width }));
  }, []);
  const onColumnResizeEnd = useCallback((column: GridColumn, width: number) => {
    const field = column.id as string;
    latest.current.onColumnResize(field, width);
    setDragWidths(prev => {
      const { [field]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  if (!resolved) return null;

  return (
    <div
      data-results-grid
      data-results-grid-ready
      onBlur={onBlur}
      style={{
        position: 'absolute',
        inset: 0,
        border: '1px solid var(--canvas-node-border)',
        borderRadius: '3px',
        overflow: 'hidden',
      }}
    >
      <DataEditor
        ref={gridRef}
        width="100%"
        height="100%"
        theme={theme}
        columns={gridColumns}
        rows={rows.length}
        getCellContent={getCellContent}
        getCellsForSelection={true}
        rowHeight={Math.round(BASE_ROW_HEIGHT * resolved.scale)}
        headerHeight={Math.round(BASE_HEADER_HEIGHT * resolved.scale)}
        minColumnWidth={50}
        maxColumnWidth={2000}
        smoothScrollX
        smoothScrollY
        gridSelection={selection}
        onGridSelectionChange={setSelection}
        getRowThemeOverride={getRowThemeOverride}
        onItemHovered={onItemHovered}
        drawHeader={drawHeader}
        provideEditor={provideEditor}
        // An edit here is an UPDATE against the database, so the only way to
        // make one is the cell editor, one cell at a time. Glide's defaults
        // would also turn Delete/Backspace on a selection, cut and paste
        // into edits - of every editable cell in the range. All three are
        // off, and anything that still arrives as more than one cell at
        // once is swallowed (returning true stops Glide calling
        // onCellEdited for each).
        keybindings={GRID_KEYBINDINGS}
        onDelete={refuse}
        onPaste={false}
        onCellsEdited={onlySingleCellEdits}
        onCellEdited={onCellEdited}
        onCellClicked={onCellClicked}
        onCellActivated={onCellActivated}
        onKeyDown={onKeyDown}
        // Double-click to edit, as before. Glide's default also opens the
        // editor on a second single click of the selected cell.
        cellActivationBehavior="double-click"
        onCellContextMenu={onCellContextMenu}
        onColumnResize={onColumnResize}
        onColumnResizeEnd={onColumnResizeEnd}
      />
    </div>
  );
});

export default ResultsGrid;
