import { runInAction } from 'mobx';
import { observer } from 'mobx-react-lite';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useStores } from '../store/store-container';
import type { Row } from '../store/session';
import {
  Box,
  IconButton,
  Tooltip,
  useTheme,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  FileDownload,
  ContentCopy,
  FilterAlt,
  BarChart as BarChartIcon,
} from '@mui/icons-material';
import UpdateModal from './UpdateModal';
import { useRetainedValue } from '../hooks/useRetainedValue';
import DownloadResultsModal from './DownloadResultsModal';
import { pineString } from '../store/util';
import { columnName, type JsonPathStep } from '../store/client';
import { jsonCellReadOnlyReason, jsonEditLiteral } from '../store/json-edit.util';
import { getColorForAlias, shouldShowTableColors } from '../store/table-colors.util';
import { estimateColumnWidth } from './column-width.util';
import { MIN_RESULT_COLUMN_WIDTH, MAX_RESULT_COLUMN_WIDTH } from '../constants';
import { BarChart } from './BarChart';
import TraversalResult from './TraversalResult';
import ResultsGrid, { type ResultsGridColumn } from './results-grid/ResultsGrid';
import ResultNotice, { type Notice } from './results-grid/ResultNotice';
import JsonInspectorPanel from './JsonInspectorPanel';
import {
  columnLooksLikeJson,
  minifyJsonText,
  parseJsonCellValue,
  prettyJson,
} from './json-cell.util';

interface ResultProps {
  sessionId: string;
}

interface ContextMenuState {
  mouseX: number;
  mouseY: number;
  cellValue: any;
  fieldIndex: string;
}

/** The value of one primary key column in the row being edited. */
interface KeyValue {
  column: string;
  value: string | number;
}

/** What saving one cell writes, and where. */
interface EditTarget {
  alias: string;
  /** How the cell's column is named in messages: `email`, `companies[0].id`. */
  name: string;
  column: string;
  /** Set for a key inside a JSON column. */
  path?: JsonPathStep[];
  /** The `update!` assignment: `email = 'a@b.c'`. */
  assignment: string;
}

interface UpdateData {
  column: string;
  value: string;
  alias: string;
  updateExpression: string;
}

interface JsonPanelState {
  id: string | number;
  field: string;
  editing: boolean;
}

const Result: React.FC<ResultProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
  // Plain arrays, stable until the next eval replaces them: the session
  // stores a result as a ref, not a deep observable (see its
  // makeAutoObservable call). That stability is what the memos below key on.
  const rows = session.rows;
  const baseColumns = session.columns;

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const colIndexToAlias = session.columnMetadata.colIndexToAliasLookup;
  // A single-table result has nothing to distinguish by table - both the
  // ambient per-table tint and the hover spotlight below are gated on this,
  // since coloring or highlighting the one table present would just be
  // visual noise with no information in it.
  //
  // Memoized against colIndexToAlias (stable between evals - see the
  // rows/baseColumns comment above for why) rather than left as a plain
  // Array.from(...)/new Set(...) computed fresh every render, so memos
  // keyed on it only re-run when the result changes.
  const uniqueAliases = React.useMemo(
    () => Array.from(new Set(Object.values(colIndexToAlias).filter(Boolean))),
    [colIndexToAlias],
  );
  const hasMultipleTables = uniqueAliases.length > 1;

  const showResultColors =
    hasMultipleTables && shouldShowTableColors(global.pineTableColorsEnabled, session);
  // Only ever constructs a CanvasStore for sessions that have actually used
  // Canvas (see getCanvasStore's own comment on why that's lazy) - reading
  // it unconditionally here would force one into existence for every plain
  // text-mode session just to check a hover state that can never be set
  // outside Canvas anyway.
  const hoveredAlias =
    hasMultipleTables && global.canvasActive ? session.getCanvasStore().hoveredAlias : null;

  // Columns whose values are JSON get a prettified, syntax-highlighted
  // preview/editor instead of the plain single-line text every other column
  // gets - detected once per render off a sample of rows (see
  // columnLooksLikeJson) rather than per cell, so an ordinary text/number
  // column never pays for the check on every row.
  const jsonColumnFields = React.useMemo(() => {
    const fields = new Set<string>();
    baseColumns.forEach(column => {
      if (columnLooksLikeJson(rows, column.field)) fields.add(column.field);
    });
    return fields;
  }, [rows, baseColumns]);

  // A dragged column width, kept here rather than inside the grid so it
  // survives the grid unmounting and remounting.
  const [resizedColumnWidths, setResizedColumnWidths] = useState<Record<string, number>>({});
  // A new eval means new columns at new field indices - an old override
  // keyed by field "2" has no reason to still apply to whatever column
  // happens to be field "2" in a completely different result set.
  useEffect(() => {
    setResizedColumnWidths({});
  }, [session.columns]);
  const handleColumnWidthChange = (field: string, width: number) => {
    setResizedColumnWidths(prev => ({ ...prev, [field]: width }));
  };

  const ast = session.response?.ast ?? null;

  // The table behind an alias, for messages people read ("user.email"
  // rather than "u_0.email"). Falls back to the alias itself.
  const tableForAlias = (alias: string): string =>
    ast?.['selected-tables']?.find(t => t.alias === alias)?.table ?? alias;

  // Why a column's values can't be edited, if they can't. An update finds
  // its row by that table's primary key, so the table needs one, and the key
  // itself is the one thing it can't change.
  const readOnlyReasonFor = (field: string, headerName: string): string | undefined => {
    const alias = colIndexToAlias[field];
    const pathTarget = session.columnMetadata.colIndexToPathLookup[field];
    const column = session.columnMetadata.colIndexToColumnLookup[field] ?? pathTarget?.column;
    if (!alias || !column) {
      return `${headerName} is worked out by the query, not stored in a table, so it can't be edited.`;
    }
    // A query that ends on a bare table doesn't list it in selected-tables,
    // and an alias like `le_0` means nothing to the reader.
    const table = tableForAlias(alias);
    const known = table !== alias;
    const key = session.columnMetadata.aliasToKeyLookup[alias];
    if (!key?.length) {
      return known
        ? `${table} values can't be edited here. ${table} has no primary key, so an update can't tell its rows apart.`
        : `These values can't be edited here. Their table has no primary key, so an update can't tell its rows apart.`;
    }
    if (!pathTarget && key.some(k => k.column === column)) {
      return `${known ? `${table}.` : ''}${column} can't be edited. It's part of the primary key, which is how an update finds the row to change.`;
    }
    return undefined;
  };

  // Why one cell of a JSON path column can't be edited: its key is missing in
  // that row, or it holds an object or an array. Read from the row's hidden
  // JSON type, so it differs from row to row.
  const cellReadOnlyReasonFor = (field: string): ((row: Row) => string | undefined) | undefined => {
    const target = session.columnMetadata.colIndexToPathLookup[field];
    if (!target) return undefined;
    const name = columnName(target.column, target.path);
    return row => jsonCellReadOnlyReason(name, row[target.typeField]);
  };

  // The primary key of the record a cell belongs to, read from its row. A
  // string saying why not, when the row has no such record: an outer join
  // that found nothing for that table leaves its key empty.
  const rowKey = (row: Row, alias: string): KeyValue[] | string => {
    const key = session.columnMetadata.aliasToKeyLookup[alias];
    if (!key?.length) return `${tableForAlias(alias)} has no primary key`;
    const values = key.map(k => ({ column: k.column, value: row[k.field] }));
    if (values.some(v => v.value === null || v.value === undefined)) {
      return `this row has no ${tableForAlias(alias)} record`;
    }
    return values as KeyValue[];
  };

  // A short message in the results pane: that a save worked ("Saved email"),
  // why one failed, or why a value can't be edited. Which cell was saved is
  // shown by the cell itself (flash, below), so the message doesn't repeat
  // it.
  const [notice, setNotice] = useState<Notice | null>(null);
  // The cell just saved, found again in the re-run's rows: the grid glows
  // it briefly.
  const [flash, setFlash] = useState<{ rowIndex: number; field: string; token: number } | null>(
    null,
  );

  // What the grid needs to know about each column. Memoized so the grid's
  // own derived state only rebuilds when a column input actually changed.
  const columns = React.useMemo<ResultsGridColumn[]>(
    () =>
      baseColumns.map(column => {
        const alias = colIndexToAlias[column.field] ?? '';
        const isJsonColumn = jsonColumnFields.has(column.field);
        const readOnlyReason = column.editable
          ? readOnlyReasonFor(column.field, column.headerName ?? column.field)
          : 'This column is read-only.';
        // Header-only, for both kinds of color a column can carry: the
        // "Table colors" preference, and the spotlight on the table hovered
        // on the canvas. Tinting every cell read as noise across a full
        // table; the header alone says which table a column belongs to. The
        // spotlight shows whether or not the preference is on, and both use
        // the same alias -> color mapping so they never disagree.
        const spotlight = !!alias && alias === hoveredAlias;
        const tinted = (showResultColors && !!alias) || spotlight;
        return {
          field: column.field,
          title: column.headerName ?? column.field,
          // A fixed width, not flex - see column-width.util.ts.
          width:
            resizedColumnWidths[column.field] ??
            estimateColumnWidth(rows, column.field, column.headerName ?? column.field, {
              min: MIN_RESULT_COLUMN_WIDTH,
              max: MAX_RESULT_COLUMN_WIDTH,
              isJson: isJsonColumn,
            }),
          json: isJsonColumn,
          // A JSON cell is edited in JsonInspectorPanel, which a click on it
          // opens already in edit mode - never inline.
          editable: column.editable && !isJsonColumn && !readOnlyReason,
          readOnlyReason,
          cellReadOnlyReason: readOnlyReason ? undefined : cellReadOnlyReasonFor(column.field),
          headerColor: tinted ? getColorForAlias(alias, ast, isDark) : undefined,
          spotlight,
        };
      }),
    // readOnlyReasonFor is rebuilt every render but reads only
    // columnMetadata and ast, both listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      baseColumns,
      rows,
      session.columnMetadata,
      colIndexToAlias,
      showResultColors,
      hoveredAlias,
      jsonColumnFields,
      resizedColumnWidths,
      ast,
      isDark,
    ],
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [updateData, setUpdateData] = useState<UpdateData | undefined>(undefined);
  // The cell the update dialog was opened for, kept while it animates shut
  // -- see the UpdateModal render below. hooks/useRetainedValue.ts.
  const retainedUpdateData = useRetainedValue(updateData);
  // Hidden columns stay in `columns` (updates still need their id column)
  // but are not drawn.
  const visibleColumns = React.useMemo(
    () => columns.filter(col => session.columnVisibilityModel[col.field] !== false),
    [columns, session.columnVisibilityModel],
  );
  const [jsonPanel, setJsonPanel] = useState<JsonPanelState | null>(null);
  // Looked up fresh from rows/columnMetadata each render (not captured when
  // the panel opens) so it reflects a re-evaluated session rather than a
  // frozen snapshot - jsonPanel itself only ever needs to remember "which
  // cell, and am I editing it", not that cell's value.
  const jsonPanelValue = jsonPanel
    ? rows.find(row => row._id === jsonPanel.id)?.[jsonPanel.field]
    : undefined;
  const jsonPanelParsed = jsonPanel ? parseJsonCellValue(jsonPanelValue) : undefined;
  const jsonPanelAlias = jsonPanel
    ? session.columnMetadata.colIndexToAliasLookup[jsonPanel.field]
    : '';
  // A key inside a JSON column, or a computed column, names no table column:
  // the panel is titled with the column's own header, `companies[0]`.
  const jsonPanelColumn = jsonPanel
    ? (session.columnMetadata.colIndexToColumnLookup[jsonPanel.field] ??
      columns.find(c => c.field === jsonPanel.field)?.title ??
      '')
    : '';

  const closeJsonPanel = () => setJsonPanel(null);

  // The row this panel points at can stop being JSON (or disappear) out
  // from under it - the session re-evaluates, a filter drops the row, and
  // so on. Rather than leave the panel open on a value that no longer
  // exists (or, worse, leave jsonPanel set but the panel invisible - see
  // the `open` prop below - so a re-click on the same cell looks like it
  // does nothing), close it the moment that happens. Only while viewing -
  // an in-progress edit has its own dirty-guard (JsonInspectorPanel's own
  // handleClose) that already refuses to disappear out from under typed
  // text, and closing it here too would fight that guard.
  useEffect(() => {
    if (jsonPanel && !jsonPanel.editing && jsonPanelParsed === undefined) {
      setJsonPanel(null);
    }
  }, [jsonPanel, jsonPanelParsed]);

  const copyJsonPanel = () => {
    if (jsonPanelParsed === undefined) return;
    const text = prettyJson(jsonPanelParsed);
    navigator.clipboard.writeText(text).then(() => {
      global.setCopiedMessage(sessionId, text, true);
    });
  };

  // Why one cell can't be edited: its column's reason, or, in a JSON path
  // column, this row's.
  const readOnlyReasonOfCell = (field: string, row: Row | undefined): string | undefined => {
    const column = columns.find(c => c.field === field);
    return column?.readOnlyReason ?? (row ? column?.cellReadOnlyReason?.(row) : undefined);
  };

  const startEditingJsonPanel = () => {
    if (!jsonPanel) return;
    const reason = readOnlyReasonOfCell(
      jsonPanel.field,
      rows.find(row => row._id === jsonPanel.id),
    );
    if (reason) {
      setNotice({ kind: 'info', text: reason });
      return;
    }
    setJsonPanel({ ...jsonPanel, editing: true });
  };

  const cancelEditingJsonPanel = () => {
    if (!jsonPanel) return;
    setJsonPanel({ ...jsonPanel, editing: false });
  };

  // The panel's own Save button - runs the same direct-execute update every
  // other cell's Enter-to-commit already does (createUpdateExpression below
  // + a virtual-session evaluate), just reached from the panel instead of
  // the grid's cell editor (JSON cells are never edited inline - see the
  // columns memo above). Returns whether the commit succeeded so the panel
  // knows whether to show its own inline "Invalid JSON" state or flip back
  // to view mode.
  const commitJsonPanel = async (text: string): Promise<boolean> => {
    if (!jsonPanel) return false;
    const minified = minifyJsonText(text);
    if (!minified.ok) return false;
    const alias = session.columnMetadata.colIndexToAliasLookup[jsonPanel.field];
    const rowData = rows.find(row => row._id === jsonPanel.id);
    if (!rowData) {
      console.error('Row data not found for id:', jsonPanel.id);
      return false;
    }
    // A key inside a JSON column whose value is a string of JSON text: saved
    // as that string, the type it had. One holding an object or array never
    // gets here; its panel is read-only.
    const target = editTarget(rowData, jsonPanel.field, minified.value);
    // A computed column names no table column; nothing to save it to.
    if (!target) return false;
    if ('error' in target) {
      setNotice({ kind: 'error', text: `Couldn't save ${target.name}: ${target.error}` });
      return false;
    }
    const key = rowKey(rowData, alias);
    if (typeof key === 'string') {
      setNotice({ kind: 'error', text: `Couldn't save ${target.name}: ${key}` });
      return false;
    }
    if (!(await runUpdate(target, key))) return false;
    // Close rather than flip back to view mode: session.evaluate() just
    // rebuilt `rows`, and `_id` is a positional index re-assigned on every
    // evaluation (see default.plugin.tsx), not a stable row identity - if
    // the update changed row order or count, jsonPanel.id could now name a
    // different row entirely. Staying open risks confidently showing the
    // wrong row's value as "what you just saved"; closing doesn't claim
    // anything.
    setJsonPanel(null);
    return true;
  };

  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportData, setExportData] = useState<{ filename: string; csvContent: string }>({
    filename: '',
    csvContent: '',
  });

  // Track data structure changes to reset view mode
  const prevDataSignature = useRef<string>('');

  // Whether the data has a bar chart's shape: two columns, the second one
  // numeric. Computed once per result rather than on every render, since it
  // scans every row. An empty string or Infinity is not a number to chart:
  // Number('') is 0 and Number('Infinity') isn't NaN, so both used to pass.
  const barChartShape = useMemo(() => {
    const visibleColumns = columns.filter(col => col.field !== '_id');
    if (visibleColumns.length !== 2 || rows.length === 0) return false;
    const secondColField = visibleColumns[1].field;
    return rows.every(row => {
      const value = row[secondColField];
      return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
    });
  }, [columns, rows]);
  // One bar, tooltip and label per row: past a couple of thousand the tab
  // stops responding, so the chart is offered only below that.
  const MAX_CHART_ROWS = 2000;
  const barChartTooLarge = rows.length > MAX_CHART_ROWS;
  const isBarChartSuitable = () => barChartShape && !barChartTooLarge;

  // Reset view mode to table only when data becomes unsuitable for bar chart
  useEffect(() => {
    const currentSignature = `${columns.length}-${rows.length}`;
    if (prevDataSignature.current && prevDataSignature.current !== currentSignature) {
      // Only reset to table if the new data is not suitable for bar chart
      if (!isBarChartSuitable()) {
        setViewMode('table');
      }
    }
    prevDataSignature.current = currentSignature;
  }, [columns.length, rows.length]);

  const handleContextMenuClose = () => {
    setContextMenu(null);
  };

  const handleCellContextMenu = (row: Row, field: string, x: number, y: number) => {
    setContextMenu({
      mouseX: x + 2,
      mouseY: y - 6,
      cellValue: row[field],
      fieldIndex: field,
    });
  };

  const handleCopyAction = () => {
    if (contextMenu?.cellValue !== undefined && contextMenu?.cellValue !== null) {
      // Pretty-print a JSON cell rather than copying its raw (possibly
      // minified, possibly object-shaped) value verbatim - this is the
      // grid's one copy action, JSON cell or not, so it doesn't need its
      // own separate "copy" button to find and learn.
      const parsedJson = parseJsonCellValue(contextMenu.cellValue);
      const text =
        parsedJson !== undefined ? prettyJson(parsedJson) : String(contextMenu.cellValue);
      navigator.clipboard.writeText(text).then(() => {
        global.setCopiedMessage(sessionId, text, true);
      });
    }
    handleContextMenuClose();
  };

  const handleFilterAction = async () => {
    if (contextMenu?.cellValue === undefined || contextMenu?.cellValue === null) {
      console.error('Filter action called without valid cell value');
      handleContextMenuClose();
      return;
    }

    // Route through the same commit path the canvas where-picker uses
    // (CanvasStore.commitWhere), not a raw pipeAndUpdateExpression string
    // append. Appending at the end of the whole pipe text left the new
    // condition's client-side owner (assigned by position, see
    // pine-text.ts's assignOwners) misattributed to whichever table the
    // pipe happens to end on, rather than the alias this cell actually
    // belongs to - the where-chip still displayed under the right node
    // (the server resolves that alias correctly), but deleting or editing
    // it looked it up by that wrong owner and silently no-opped, or hit an
    // unrelated chip that happened to share the index. commitWhere's
    // appendOwnedSegment inserts right after the owning alias's own
    // segments instead, keeping the two attributions in agreement.
    const alias = session.columnMetadata.colIndexToAliasLookup[contextMenu.fieldIndex];
    const dbColumn = session.columnMetadata.colIndexToColumnLookup[contextMenu.fieldIndex];
    if (alias && dbColumn) {
      await session
        .getCanvasStore()
        .commitWhere(alias, [{ alias, column: dbColumn, operator: '=', value: String(contextMenu.cellValue) }]);
    } else {
      console.error('Missing alias/column metadata for filter action:', {
        fieldIndex: contextMenu.fieldIndex,
        alias,
        dbColumn,
      });
    }
    handleContextMenuClose();
  };

  // What an edit of one cell writes: `email = 'a@b.c'` for a column, or
  // `dp.companies[0].id = 7` for a key inside a JSON column, written as the
  // type the value had. Or why it can't be written. Null for a computed
  // column, which names nothing to write to.
  const editTarget = (
    row: Row,
    field: string,
    value: string,
  ): EditTarget | { name: string; error: string } | null => {
    // The field is the column's index, stringified; the alias says which
    // table it came from, and so which key columns identify the row.
    const alias = session.columnMetadata.colIndexToAliasLookup[field];
    const pathTarget = session.columnMetadata.colIndexToPathLookup[field];
    if (pathTarget) {
      const name = columnName(pathTarget.column, pathTarget.path);
      const type = row[pathTarget.typeField];
      const reason = jsonCellReadOnlyReason(name, type);
      if (reason) return { name, error: reason };
      const literal = jsonEditLiteral(name, type, value);
      if ('error' in literal) return { name, error: literal.error };
      // Qualified by the alias: after `from: dp`, `dp.companies` can only
      // mean that table's column, whatever else is called `companies`.
      return {
        alias,
        name,
        column: pathTarget.column,
        path: pathTarget.path,
        assignment: `${alias}.${name} = ${literal.literal}`,
      };
    }
    const column = session.columnMetadata.colIndexToColumnLookup[field];
    if (!column) return null;
    return { alias, name: column, column, assignment: `${column} = ${pineString(value)}` };
  };

  // Enter in a cell's editor: run the update straight away, without the
  // dialog. The dialog is for the editor's Inspect button (inspectEdit).
  const commitEdit = async (row: Row, field: string, value: string) => {
    const target = editTarget(row, field, value);
    if (!target) return;
    if ('error' in target) {
      setNotice({ kind: 'error', text: `Couldn't save ${target.name}: ${target.error}` });
      // The grid shows the typed text until the next result arrives.
      await session.evaluate();
      return;
    }
    const key = rowKey(row, target.alias);
    if (typeof key === 'string') {
      setNotice({ kind: 'error', text: `Couldn't save ${target.name}: ${key}` });
      return;
    }
    await runUpdate(target, key);
  };

  // Runs one update through the virtual session, then re-runs this tab's
  // query so the grid shows what the database now holds (after a failure,
  // the value that is still there). A save that worked glows in its cell and
  // says so briefly; a failure says why.
  const runUpdate = async (target: EditTarget, key: KeyValue[]): Promise<boolean> => {
    const { alias, name, column, path } = target;
    let error = '';
    try {
      const updateExpression = await createUpdateExpression(
        session.expression,
        alias,
        key,
        target.assignment,
        { requireRow: true },
      );
      const vs = global.getVirtualSession();
      runInAction(() => {
        vs.expression = updateExpression;
      });
      await vs.evaluate();
      error = vs.error;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    setNotice(
      error
        ? { kind: 'error', text: `Couldn't save ${name}: ${error}` }
        : { kind: 'success', text: `Saved ${name}` },
    );
    await session.evaluate();
    if (!error) {
      // Where the row and the column are now: the re-run can reorder rows,
      // and field indices belong to one result, not the next.
      const meta = session.columnMetadata;
      const samePath = (p: JsonPathStep[]) => JSON.stringify(p) === JSON.stringify(path);
      const field = Object.keys(meta.colIndexToAliasLookup).find(f => {
        if (meta.colIndexToAliasLookup[f] !== alias) return false;
        const pathTarget = meta.colIndexToPathLookup[f];
        return path
          ? !!pathTarget && pathTarget.column === column && samePath(pathTarget.path)
          : meta.colIndexToColumnLookup[f] === column;
      });
      const keyFields = meta.aliasToKeyLookup[alias] ?? [];
      const rowIndex = keyFields.length
        ? session.rows.findIndex(row =>
            keyFields.every(
              k => String(row[k.field]) === String(key.find(v => v.column === k.column)?.value),
            ),
          )
        : -1;
      if (field && rowIndex >= 0) setFlash({ rowIndex, field, token: Date.now() });
    }
    return !error;
  };

  const handleModalClose = () => {
    session.evaluate();
    setUpdateData(undefined);
  };

  // Helper function to create update expression
  const createUpdateExpression = async (
    baseExpression: string,
    alias: string,
    key: KeyValue[],
    assignment: string,
    { requireRow = false }: { requireRow?: boolean } = {},
  ) => {
    const vs = global.getVirtualSession();

    // Reset virtual session state
    vs.setMessage('');
    runInAction(() => {
      vs.error = '';
      vs.loading = false;
    });
    vs.setInputMode('pine');

    // Set up the update query
    runInAction(() => {
      vs.expression = baseExpression;
    });
    await vs.prettify();
    await vs.pipeAndUpdateExpression(`from: ${alias}`);
    // One where: step per key column. Separate steps combine with AND;
    // inside one where:, conditions can only be joined with `or`.
    for (const { column: keyColumn, value: keyValue } of key) {
      await vs.pipeAndUpdateExpression(
        `where: ${keyColumn} = ${Number.isInteger(keyValue) ? String(keyValue) : pineString(String(keyValue))}`,
      );
    }
    // Enter in a cell saves without a dialog, so check first that the row
    // is still there. The primary key names exactly one record, so the
    // update can't change more than that one. The count can still be above
    // one: in `employee | document`, an employee appears once per document.
    if (requireRow) {
      const matching = await vs.countRows();
      if (matching === 0) {
        throw new Error('the row is no longer there');
      }
    }
    await vs.pipeAndUpdateExpression(`update! ${assignment}`);

    return vs.expression;
  };

  // Inspect action for JsonInspectorPanel's own "Inspect" button (edit mode
  // only) - mirrors inspectEdit above, minified
  // rather than the prettified text the panel shows, since that's the value
  // that will actually be committed.
  const openJsonInspect = async (id: string | number, field: string, text: string) => {
    const minified = minifyJsonText(text);
    if (!minified.ok) return;
    const rowData = rows.find(row => row._id === id);
    if (!rowData) {
      console.error('Row data not found for id:', id);
      return;
    }
    await inspectEdit(rowData, field, minified.value);
  };

  // The cell editor's Inspect button: build the update and show it in
  // UpdateModal instead of running it.
  const inspectEdit = async (row: Row, field: string, value: string) => {
    const target = editTarget(row, field, value);
    if (!target) return;
    if ('error' in target) {
      setNotice({ kind: 'error', text: `Can't edit ${target.name}: ${target.error}` });
      return;
    }
    const key = rowKey(row, target.alias);
    if (typeof key === 'string') {
      setNotice({ kind: 'error', text: `Can't edit ${target.name}: ${key}` });
      return;
    }
    const updateExpression = await createUpdateExpression(
      session.expression,
      target.alias,
      key,
      target.assignment,
    );
    setUpdateData({ column: target.name, value, alias: target.alias, updateExpression });
  };

  const exportToCSV = () => {
    if (columns.length === 0 || rows.length === 0) {
      return;
    }

    const csvContent = session.getResultClipboardText();
    const defaultFilename = `pine-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;

    setExportData({ filename: defaultFilename, csvContent });
    setExportModalOpen(true);
  };

  // A traversal is a result too -- it just wants a tree rather than a grid.
  // Checked before the empty-state guard below, since a traversal has no
  // columns and would otherwise be mistaken for "nothing has run yet".
  if (session.traversal) {
    return <TraversalResult session={session} />;
  }

  if (columns.length === 0) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box
          sx={{
            border: '2px dashed var(--canvas-node-border)',
            borderRadius: '3px',
            color: 'var(--canvas-text-dim)',
            fontFamily: 'var(--canvas-font)',
            fontSize: 'calc(12px * var(--text-scale, 1))',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
            padding: '20px 32px',
          }}
        >
          Run a query to see results here
        </Box>
      </Box>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
      }}
    >
      {/* The following Box wrapppers were added because the grid was not
      respecting the max width. Hack taken from here:
      https://github.com/mui/mui-x/issues/8895#issuecomment-1793433389*/}
      <Box sx={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {/* CSV Export Button */}
        <Tooltip title="Export to CSV">
          <IconButton
            onClick={exportToCSV}
            disabled={rows.length === 0}
            aria-label="Export to CSV"
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              zIndex: 1000,
              borderRadius: '4px',
              backgroundColor: 'var(--canvas-node-bg)',
              border: '1px solid var(--canvas-node-border)',
              color: 'var(--canvas-trace)',
              fontFamily: 'var(--canvas-font)',
              '&:hover': {
                backgroundColor: 'var(--canvas-chip-bg)',
              },
              '&:disabled': {
                opacity: 0.5,
                color: 'var(--canvas-text-dim)',
              },
            }}
            size="small"
          >
            <FileDownload fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Copy Result Button */}
        <Tooltip title="Copy result as CSV">
          <IconButton
            onClick={() => {
              navigator.clipboard.writeText(session.getResultClipboardText()).then(() => {
                global.setCopiedMessage(
                  sessionId,
                  `${rows.length} row${rows.length === 1 ? '' : 's'}`,
                );
              });
            }}
            disabled={rows.length === 0}
            aria-label="Copy result as CSV"
            sx={{
              position: 'absolute',
              top: 4,
              right: 48,
              zIndex: 1000,
              borderRadius: '4px',
              backgroundColor: 'var(--canvas-node-bg)',
              border: '1px solid var(--canvas-node-border)',
              color: 'var(--canvas-trace)',
              fontFamily: 'var(--canvas-font)',
              '&:hover': {
                backgroundColor: 'var(--canvas-chip-bg)',
              },
              '&:disabled': {
                opacity: 0.5,
                color: 'var(--canvas-text-dim)',
              },
            }}
            size="small"
          >
            <ContentCopy fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Bar Chart Toggle Button */}
        {barChartShape && barChartTooLarge && (
          <Tooltip title={`Too many rows to chart (over ${MAX_CHART_ROWS.toLocaleString()})`}>
            <span style={{ position: 'absolute', top: 4, right: 92, zIndex: 1000 }}>
              <IconButton disabled size="small" aria-label="Bar chart unavailable for this many rows">
                <BarChartIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {isBarChartSuitable() && (
          <Tooltip title={viewMode === 'table' ? 'View as Bar Chart' : 'View as Table'}>
            <IconButton
              onClick={() => setViewMode(viewMode === 'table' ? 'chart' : 'table')}
              aria-label={viewMode === 'table' ? 'View as bar chart' : 'View as table'}
              sx={{
                position: 'absolute',
                top: 4,
                right: 92,
                zIndex: 1000,
                borderRadius: '4px',
                backgroundColor: 'var(--canvas-node-bg)',
                border: '1px solid var(--canvas-node-border)',
                color: viewMode === 'chart' ? 'var(--canvas-trace)' : 'var(--canvas-text-dim)',
                fontFamily: 'var(--canvas-font)',
                '&:hover': {
                  backgroundColor: 'var(--canvas-chip-bg)',
                },
              }}
              size="small"
            >
              <BarChartIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        {/* Conditional rendering: Table or Bar Chart */}
        {viewMode === 'table' ? (
          <Box sx={{ position: 'absolute', inset: 0 }}>
            <ResultsGrid
              columns={visibleColumns}
              rows={rows}
              onColumnResize={handleColumnWidthChange}
              onJsonOpen={(row, field) =>
                // Straight into edit mode, unless the value can't be changed:
                // then it opens to read.
                setJsonPanel({
                  id: row._id,
                  field,
                  editing: !readOnlyReasonOfCell(field, row),
                })
              }
              onReadOnlyEdit={reason => setNotice({ kind: 'info', text: reason })}
              flash={flash}
              onCommitEdit={commitEdit}
              onInspectEdit={inspectEdit}
              onCellContextMenu={handleCellContextMenu}
            />
          </Box>
        ) : (
          <Box sx={{ width: '100%', overflow: 'auto' }}>
            <BarChart
              data={(() => {
                const visibleColumns = columns.filter(col => col.field !== '_id');
                const labelField = visibleColumns[0].field;
                const valueField = visibleColumns[1].field;
                return rows.map(row => ({
                  label: String(row[labelField] ?? ''),
                  value: Number(row[valueField] ?? 0),
                }));
              })()}
            />
          </Box>
        )}
      </Box>
      {viewMode === 'table' && (
        <Box
          data-results-row-count
          sx={{
            flexShrink: 0,
            px: '10px',
            pt: '4px',
            textAlign: 'right',
            color: 'var(--canvas-text-dim)',
            fontFamily: 'var(--canvas-font)',
            fontSize: 'calc(12px * var(--text-scale, 1))',
          }}
        >
          {rows.length.toLocaleString()} row{rows.length === 1 ? '' : 's'}
        </Box>
      )}

      {contextMenu && (
        <Menu
          open={!!contextMenu}
          onClose={handleContextMenuClose}
          anchorReference="anchorPosition"
          anchorPosition={
            contextMenu.mouseX > 0 && contextMenu.mouseY > 0
              ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
              : undefined
          }
          slotProps={{
            paper: {
              sx: {
                backgroundColor: 'var(--canvas-picker-bg)',
                // See ActiveConnection.tsx's matching comment - MUI's Paper
                // otherwise lightens this with a dark-mode elevation
                // overlay, rendering it visibly different from every other
                // panel using the same token.
                backgroundImage: 'none',
                border: '1px solid var(--canvas-picker-border)',
                color: 'var(--canvas-text)',
                fontFamily: 'var(--canvas-font)',
              },
            },
          }}
        >
          <MenuItem
            onClick={handleCopyAction}
            sx={{ '&:hover': { backgroundColor: 'var(--canvas-chip-bg)' } }}
          >
            <ListItemIcon sx={{ color: 'var(--canvas-trace)' }}>
              <ContentCopy fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Copy" />
          </MenuItem>
          <MenuItem
            onClick={handleFilterAction}
            sx={{ '&:hover': { backgroundColor: 'var(--canvas-chip-bg)' } }}
          >
            <ListItemIcon sx={{ color: 'var(--canvas-trace)' }}>
              <FilterAlt fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Filter" />
          </MenuItem>
        </Menu>
      )}

      {/* Mounted unconditionally rather than behind `{updateData && ...}`:
          unmounting it the instant the data cleared meant its closing
          animation never got to run. It keeps rendering the cell it was
          opened for while it fades (useRetainedValue); MUI's Modal still
          takes its own contents out of the DOM once that finishes, so
          nothing is left behind. */}
      <UpdateModal
        updateExpression={retainedUpdateData?.updateExpression ?? ''}
        updateData={retainedUpdateData}
        open={Boolean(updateData)}
        onClose={handleModalClose}
      />

      <ResultNotice notice={notice} onClose={() => setNotice(null)} />

      {/* Export Modal */}
      <DownloadResultsModal
        open={exportModalOpen}
        defaultFilename={exportData.filename}
        csvContent={exportData.csvContent}
        onClose={() => setExportModalOpen(false)}
      />

      {/* JSON cell inspector - view and edit, see JsonInspectorPanel's own comment for why this replaced three separate surfaces */}
      <JsonInspectorPanel
        open={!!jsonPanel && jsonPanelParsed !== undefined}
        title={`${jsonPanelAlias}.${jsonPanelColumn}`}
        parsed={jsonPanelParsed}
        isDark={isDark}
        editing={!!jsonPanel?.editing}
        onClose={closeJsonPanel}
        onCopy={copyJsonPanel}
        onEditStart={startEditingJsonPanel}
        onCancelEdit={cancelEditingJsonPanel}
        onCommit={commitJsonPanel}
        onInspect={text => {
          if (!jsonPanel) return;
          openJsonInspect(jsonPanel.id, jsonPanel.field, text);
        }}
      />
    </div>
  );
});

export default Result;
