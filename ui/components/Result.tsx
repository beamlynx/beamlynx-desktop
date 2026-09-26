import { runInAction } from 'mobx';
import { observer } from 'mobx-react-lite';
import React, { useState, useEffect, useRef } from 'react';
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
  Skeleton,
} from '@mui/material';
import {
  FileDownload,
  ContentCopy,
  FilterAlt,
  BarChart as BarChartIcon,
} from '@mui/icons-material';
import UpdateModal from './UpdateModal';
import { useRetainedValue } from '../hooks/useRetainedValue';
import { useResultsSettling } from '../hooks/useResultsSettling';
import { usePanelPresence } from '../hooks/usePanelPresence';
import { MOTION } from '../styles/motion';
import DownloadResultsModal from './DownloadResultsModal';
import { pineEscape } from '../store/util';
import { getColorForAlias, shouldShowTableColors } from '../store/table-colors.util';
import { estimateColumnWidth } from './column-width.util';
import { MIN_RESULT_COLUMN_WIDTH, MAX_RESULT_COLUMN_WIDTH } from '../constants';
import { BarChart } from './BarChart';
import TraversalResult from './TraversalResult';
import ResultsGrid, { type ResultsGridColumn } from './results-grid/ResultsGrid';
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

interface UpdateData {
  column: string;
  id: string | number;
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

  // What the grid needs to know about each column. Memoized so the grid's
  // own derived state only rebuilds when a column input actually changed.
  const columns = React.useMemo<ResultsGridColumn[]>(
    () =>
      baseColumns.map(column => {
        const alias = colIndexToAlias[column.field] ?? '';
        const isJsonColumn = jsonColumnFields.has(column.field);
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
          editable: column.editable && !isJsonColumn,
          headerColor: tinted ? getColorForAlias(alias, ast, isDark) : undefined,
          spotlight,
        };
      }),
    [
      baseColumns,
      rows,
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
  const resultsSettling = useResultsSettling();
  // A short exit fade of its own (MOTION.fast, not the default MOTION.exit)
  // -- freeze-during-motion.ts's own buffer already decides WHEN it's safe
  // to reveal the grid; this only softens THAT reveal into a crossfade
  // instead of a hard cut, so it shouldn't add a second, longer delay on
  // top of a timing that was already tuned.
  const settlingOverlay = usePanelPresence<HTMLDivElement>(resultsSettling, MOTION.fast, false);
  // Hidden columns stay in `columns` (updates still need their id column)
  // but are not drawn. Shared by the grid and the settling placeholder.
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
  const jsonPanelColumn = jsonPanel
    ? session.columnMetadata.colIndexToColumnLookup[jsonPanel.field]
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

  const startEditingJsonPanel = () => {
    if (!jsonPanel) return;
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
    const idColumnIndex = session.columnMetadata.aliasToIdLookup[alias];
    if (!idColumnIndex) {
      console.error('No id column index found for alias:', alias);
      return false;
    }
    const rowData = rows.find(row => row._id === jsonPanel.id);
    if (!rowData) {
      console.error('Row data not found for id:', jsonPanel.id);
      return false;
    }
    const rowId = rowData[idColumnIndex];
    const column = session.columnMetadata.colIndexToColumnLookup[jsonPanel.field];
    try {
      const updateExpression = await createUpdateExpression(
        session.expression,
        alias,
        rowId,
        column,
        minified.value,
      );
      const vs = global.getVirtualSession();
      runInAction(() => {
        vs.expression = updateExpression;
      });
      await vs.evaluate();
      await session.evaluate();
    } catch (error) {
      console.error('JSON cell update failed:', error);
      return false;
    }
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

  // Check if data is suitable for bar chart visualization
  const isBarChartSuitable = () => {
    // Check: exactly 2 columns (excluding _id)
    const visibleColumns = columns.filter(col => col.field !== '_id');
    if (visibleColumns.length !== 2) return false;

    // Check: second column has numeric values
    const secondColField = visibleColumns[1].field;
    if (rows.length === 0) return false;

    return rows.every(row => {
      const value = row[secondColField];
      return value !== null && value !== undefined && !isNaN(Number(value));
    });
  };

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
        .commitWhere(alias, dbColumn, '=', String(contextMenu.cellValue));
    } else {
      console.error('Missing alias/column metadata for filter action:', {
        fieldIndex: contextMenu.fieldIndex,
        alias,
        dbColumn,
      });
    }
    handleContextMenuClose();
  };

  // Enter in a cell's editor: run the update straight away, without the
  // dialog. The dialog is for the editor's Inspect button (inspectEdit).
  const commitEdit = async (row: Row, field: string, value: string) => {
    // The field is the column's index, stringified; the alias says which
    // table it came from, and so which id column identifies the row.
    const alias = session.columnMetadata.colIndexToAliasLookup[field];
    const idColumnIndex = session.columnMetadata.aliasToIdLookup[alias];
    if (!idColumnIndex) {
      console.error('No id column index found for alias:', alias);
      return;
    }
    const id = row[idColumnIndex];
    const column = session.columnMetadata.colIndexToColumnLookup[field];
    try {
      const updateExpression = await createUpdateExpression(
        session.expression,
        alias,
        id,
        column,
        value,
      );
      const vs = global.getVirtualSession();
      runInAction(() => {
        vs.expression = updateExpression;
      });
      await vs.evaluate();
      await session.evaluate();
    } catch (error) {
      console.error('Direct update failed:', error);
    }
  };

  const handleModalClose = () => {
    session.evaluate();
    setUpdateData(undefined);
  };

  // Helper function to create update expression
  const createUpdateExpression = async (
    baseExpression: string,
    alias: string,
    id: string | number,
    column: string,
    value: string,
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
    await vs.pipeAndUpdateExpression(
      `where: id = ${Number.isInteger(id) ? parseInt(id as string, 10) : `'${pineEscape(id as string)}'`}`,
    );
    await vs.pipeAndUpdateExpression(`update! ${column} = '${pineEscape(value)}'`);

    return vs.expression;
  };

  // Inspect action for JsonInspectorPanel's own "Inspect" button (edit mode
  // only) - mirrors inspectEdit above, minified
  // rather than the prettified text the panel shows, since that's the value
  // that will actually be committed.
  const openJsonInspect = async (id: string | number, field: string, text: string) => {
    const minified = minifyJsonText(text);
    if (!minified.ok) return;
    const alias = session.columnMetadata.colIndexToAliasLookup[field];
    const idColumnIndex = session.columnMetadata.aliasToIdLookup[alias];
    if (!idColumnIndex) {
      console.error('No id column index found for alias:', alias);
      return;
    }
    const rowData = rows.find(row => row._id === id);
    if (!rowData) {
      console.error('Row data not found for id:', id);
      return;
    }
    const rowId = rowData[idColumnIndex];
    const column = session.columnMetadata.colIndexToColumnLookup[field];
    const updateExpression = await createUpdateExpression(
      session.expression,
      alias,
      rowId,
      column,
      minified.value,
    );
    setUpdateData({ column, id: rowId, value: minified.value, alias, updateExpression });
  };

  // The cell editor's Inspect button: build the update and show it in
  // UpdateModal instead of running it.
  const inspectEdit = async (row: Row, field: string, value: string) => {
    const alias = session.columnMetadata.colIndexToAliasLookup[field];
    const idColumnIndex = session.columnMetadata.aliasToIdLookup[alias];
    if (!idColumnIndex) {
      console.error('No id column index found for alias:', alias);
      return;
    }
    const rowId = row[idColumnIndex];
    const column = session.columnMetadata.colIndexToColumnLookup[field];
    const updateExpression = await createUpdateExpression(
      session.expression,
      alias,
      rowId,
      column,
      value,
    );
    setUpdateData({ column, id: rowId, value, alias, updateExpression });
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
      style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
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
            {/* Unmounted (not just hidden) while resultsSettling is true -
                see the placeholder overlay's own comment for what that
                buys over merely covering an unmounted grid. */}
            {!resultsSettling && (
              <ResultsGrid
                columns={visibleColumns}
                rows={rows}
                onColumnResize={handleColumnWidthChange}
                onJsonOpen={(row, field) => setJsonPanel({ id: row._id, field, editing: true })}
                onCommitEdit={commitEdit}
                onInspectEdit={inspectEdit}
                onCellContextMenu={handleCellContextMenu}
              />
            )}
            {/* EMPTY during the resize settle-work freeze-during-motion.ts
                describes - not just covered, actually not there. Covering a
                still-mounted grid (an earlier version of this) hides what's
                drawn but does nothing for the cost itself: React still
                reconciles every GridCell/GridRow and Emotion still
                recomputes every cell's style on the SAME main thread
                everything else runs on, so a click, a hover, anything else
                on screen stayed blocked regardless of what was visually on
                top of the grid - measured directly (a main-thread
                responsiveness probe, not frame timing) at 300-400ms of
                blocked time either way. Unmounting removes the trigger
                instead of hiding its effect: nothing is reconciling if
                nothing is mounted. The grid remounts once settling ends,
                fresh, directly at its final size - a cold mount instead of
                an old instance reconciling across a resize, which measured
                as the cheaper of the two (see this commit's own history for
                the comparison). Deliberately plain - no spinner or shimmer -
                because nothing is loading, something already on screen is
                momentarily settling into a new size. pointerEvents: 'none'
                so it never intercepts a click meant for the grid on the way
                out, and it's rendered on top of (not instead of) the
                remounting grid for a brief window so the two crossfade
                rather than the fresh mount popping in underneath it. */}
            {settlingOverlay.mounted && (
              <Box
                ref={settlingOverlay.ref}
                data-results-settling-overlay
                sx={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  overflow: 'hidden',
                  backgroundColor: 'var(--canvas-node-bg)',
                  border: '1px solid var(--canvas-node-border)',
                  borderRadius: '3px',
                  opacity: settlingOverlay.open ? 1 : 0,
                  transition: 'opacity var(--motion-fast) ease',
                }}
              >
                {/* A shell of the real grid, not a blank card - the header
                    row is rebuilt from the same `columns` this render
                    already computed (same widths, same names, same table-
                    color/hover tint), so what's on screen a moment ago is
                    still recognizably there while the body is quiet. Row
                    heights (40/36px) are read off the live grid rather than
                    a MUI constant, since density is a prop we set, not a
                    value published anywhere stable to import. */}
                <Box sx={{ display: 'flex', height: 40, flexShrink: 0 }}>
                  {visibleColumns.map(col => {
                    const alias = colIndexToAlias[col.field] ?? '';
                    const tinted = (showResultColors && alias) || (alias && alias === hoveredAlias);
                    return (
                      <Box
                        key={col.field}
                        sx={{
                          width: col.width,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          px: '10px',
                          borderRight: '1px solid var(--canvas-node-border)',
                          borderBottom: '1px solid var(--canvas-node-border)',
                          backgroundColor: tinted
                            ? getColorForAlias(alias, ast, isDark)
                            : 'var(--canvas-chip-bg)',
                          color: 'var(--canvas-text)',
                          fontFamily: 'var(--code-font)',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {col.title}
                      </Box>
                    );
                  })}
                </Box>
                {/* Skeleton rows below the (real) header. Widths per cell
                    vary a little (a seeded pattern, not random - random
                    would reshuffle every render and read as flickering)
                    rather than one uniform bar repeated, which is what
                    reads as "rows of data" instead of "a striped rectangle"
                    at a glance. Capped at 12 - this is a settle-window
                    placeholder, not a paginated view, so it only ever needs
                    to fill the visible card, never actually scroll. */}
                {Array.from({ length: 12 }).map((_, rowIndex) => (
                  <Box
                    key={rowIndex}
                    sx={{
                      display: 'flex',
                      height: 36,
                      flexShrink: 0,
                      borderBottom: '1px solid var(--canvas-node-border)',
                    }}
                  >
                    {visibleColumns.map((col, colIndex) => (
                      <Box
                        key={col.field}
                        sx={{
                          width: col.width,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          px: '10px',
                          borderRight: '1px solid var(--canvas-node-border)',
                        }}
                      >
                        <Skeleton
                          variant="text"
                          animation="wave"
                          width={`${55 + ((rowIndex * 7 + colIndex * 13) % 35)}%`}
                          height={14}
                          sx={{ bgcolor: 'var(--canvas-chip-bg)', flexShrink: 0 }}
                        />
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>
            )}
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
