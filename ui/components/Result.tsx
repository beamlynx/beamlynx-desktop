import { DataGrid } from '@mui/x-data-grid';
import { runInAction, toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import React, { useState, useEffect, useRef } from 'react';
import { useStores } from '../store/store-container';
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
  Code,
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
import JsonCellContent from './JsonCellContent';
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
  // Memoized against session.rows/session.columns THEMSELVES (the raw MobX
  // observables), not against their own output - toJS() allocates a brand
  // new array on every call, so keying a memo off its own result never
  // skips anything. session.rows/session.columns are only ever reassigned
  // on a fresh eval (see plugin/default.plugin.tsx) - stable in between,
  // including across a hover change or an unrelated re-render like a panel
  // opening elsewhere in the app. This is what makes jsonColumnFields below,
  // and the columns/color memos further down, actually work rather than
  // recomputing on every render regardless of their own dependency arrays.
  const rows = React.useMemo(() => toJS(session.rows), [session.rows]);
  const baseColumns = React.useMemo(() => toJS(session.columns), [session.columns]);

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
  // Array.from(...)/new Set(...) computed fresh every render: this feeds
  // columnColorSx below, and an unstable uniqueAliases would defeat that
  // memo the same way an unstable baseColumns defeated jsonColumnFields'.
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

  // A manual column resize used to live entirely inside DataGrid's own
  // internal state, which is fine as long as DataGrid never unmounts - but
  // it now does, briefly, during the resize settle-work (see the DataGrid
  // render below and freeze-during-motion.ts for why). Unmounting destroys
  // that internal state along with it, so a resize you just dragged would
  // silently revert to the estimated default the moment a panel elsewhere
  // finished animating - confirmed live, this is the regression that
  // reintroduces. Tracked here instead, in state that outlives the grid's
  // own mount/unmount cycle, and merged into the columns memo below.
  const [resizedColumnWidths, setResizedColumnWidths] = useState<Record<string, number>>({});
  // A new eval means new columns at new field indices - an old override
  // keyed by field "2" has no reason to still apply to whatever column
  // happens to be field "2" in a completely different result set.
  useEffect(() => {
    setResizedColumnWidths({});
  }, [session.columns]);
  const handleColumnWidthChange = (params: { colDef: { field: string }; width: number }) => {
    setResizedColumnWidths(prev => ({ ...prev, [params.colDef.field]: params.width }));
  };

  const ast = session.response?.ast ?? null;

  // Add custom edit component and column color classes by table alias.
  //
  // Memoized for two independent reasons. First, correctness: MUI DataGrid
  // treats a brand-new `columns` array reference as a brand-new column
  // model and resets state it otherwise tracks internally, including a
  // width you just dragged by hand - confirmed live as "any time I resize
  // a column, it goes back after a rerender". Passing the SAME array
  // reference across a render that didn't actually change any column input
  // is what keeps a manual resize intact.
  //
  // Second, cost: building this array runs a JSON-detection check and two
  // string-building steps per column, and MUI re-derives cell/header
  // rendering from whatever it's handed. Rebuilding it on every render this
  // component makes - which, before rows/baseColumns were memoized above,
  // was EVERY render, since toJS() output was its own unstable memo key -
  // was extra work landing in the same window as whatever else triggered
  // that render, including a panel opening elsewhere in the app.
  //
  // CellEditComponent and setJsonPanel are intentionally not in the
  // dependency list. CellEditComponent is redefined every Result render
  // (see its own definition further down) but only reads session/rows at
  // the moment it's actually invoked (a cell edit), by which point this
  // memo would already have re-run if either had changed - and setJsonPanel
  // is a setState function, which React itself guarantees is stable for
  // the lifetime of this component instance.
  const columns = React.useMemo(
    () =>
      baseColumns.map(column => {
        const alias = colIndexToAlias[column.field] ?? '';
        // Header-only, for both kinds of color this column can carry - the
        // ambient "Table colors" preference AND the hover spotlight below.
        // Coloring every cell (confirmed live: this was still happening
        // while hovering a canvas node even with the preference OFF, since
        // the spotlight was never gated on it) read as visual noise across
        // a full table of rows; the header alone already says which table
        // a column belongs to, whether that's shown all the time (colors
        // on) or only while you're pointing at that table on the canvas
        // (hovering).
        const headerClasses = [
          showResultColors && alias ? `result-col-${alias.replace(/[^a-z0-9_]/gi, '_')}` : '',
          alias && alias === hoveredAlias ? 'result-col-hovered' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const isJsonColumn = jsonColumnFields.has(column.field);
        return {
          ...column,
          // A fixed width, not flex - see column-width.util.ts's own
          // comment for why, and plugin/default.plugin.tsx for the
          // sizing props (flex/minWidth/maxWidth) this replaces at the
          // source. Estimated here rather than at eval time because
          // jsonColumnFields (whether to skip content sampling for this
          // column) is only known once JSON detection has run, and both
          // already live in this same memo.
          width:
            resizedColumnWidths[column.field] ??
            estimateColumnWidth(rows, column.field, column.headerName ?? column.field, {
              min: MIN_RESULT_COLUMN_WIDTH,
              max: MAX_RESULT_COLUMN_WIDTH,
              isJson: isJsonColumn,
            }),
          renderEditCell: (params: any) => <CellEditComponent {...params} />,
          ...(isJsonColumn && {
            // Not editable at the DataGrid level - editing a JSON cell
            // happens entirely inside JsonInspectorPanel, opened already in
            // edit mode by this same click (see onOpen below), not via
            // DataGrid's own double-click/F2/type-to-edit. renderEditCell
            // above is therefore dead code for this column (never
            // invoked), left in place rather than branched around since
            // it's harmless.
            editable: false,
            renderCell: (params: any) => (
              <JsonCellContent
                value={params.value}
                onOpen={() => setJsonPanel({ id: params.id, field: params.field, editing: true })}
              />
            ),
          }),
          ...(headerClasses && { headerClassName: headerClasses }),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      baseColumns,
      colIndexToAlias,
      showResultColors,
      hoveredAlias,
      jsonColumnFields,
      resizedColumnWidths,
    ],
  );

  // Header-only, matching the classes above - see their own comment for why
  // cells no longer get an ambient background. Memoized for the same
  // "unstable reference costs real work" reason as columns above: this
  // object feeds the DataGrid's `sx` prop, and MUI's style engine has to
  // reprocess and re-inject CSS whenever that reference changes, whether or
  // not any color in it actually did.
  const columnColorSx = React.useMemo(
    () =>
      showResultColors && uniqueAliases.length
        ? Object.fromEntries(
            uniqueAliases.map(alias => {
              const safeClass = `result-col-${alias.replace(/[^a-z0-9_]/gi, '_')}`;
              const color = getColorForAlias(alias, ast, isDark);
              return [`& .MuiDataGrid-columnHeader.${safeClass}`, { backgroundColor: color }];
            }),
          )
        : {},
    [showResultColors, uniqueAliases, ast, isDark],
  );
  // A hover spotlight, independent of the "Table colors" preference above -
  // this answers "which columns belong to the table I'm pointing at right
  // now", not "always tint everything", so it fires regardless of
  // showResultColors. Header-only, same as the ambient color above and for
  // the same reason (see the columns memo's own comment) - this used to
  // also tint every cell, visible even with "Table colors" turned off,
  // which is what made the preference look like it wasn't doing anything.
  // Reuses the same alias->color mapping so the two never disagree when
  // both are visible at once.
  const hoveredColorSx = React.useMemo(
    () =>
      hoveredAlias
        ? {
            '& .MuiDataGrid-columnHeader.result-col-hovered': {
              backgroundColor: getColorForAlias(hoveredAlias, ast, isDark),
              // inset box-shadow, not border-top: a real border adds 2px of
              // layout height only to the hovered columns' headers,
              // jittering the header row as the spotlight moves between
              // them - a shadow paints over existing space instead, and
              // (unlike a border-width change) actually animates via the
              // transition below.
              boxShadow: 'inset 0 2px 0 var(--canvas-trace)',
              transition: 'background-color 120ms ease, box-shadow 120ms ease',
            },
          }
        : {},
    [hoveredAlias, ast, isDark],
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
  // Shared between the settling placeholder's header row and its skeleton
  // body below, so the two don't each recompute (and risk disagreeing on)
  // which columns are actually visible.
  const visibleColumnsForSettling = React.useMemo(
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
  // DataGrid's processRowUpdate (JSON columns are `editable: false` at the
  // DataGrid level now - see the columns map above - so processRowUpdate
  // never runs for them). Returns whether the commit succeeded so the panel
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

  const handleContextMenu = (event: React.MouseEvent, params: any) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX + 2,
      mouseY: event.clientY - 6,
      cellValue: params.value,
      fieldIndex: params.field,
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

  const updateRecord = async (newRow: any, oldRow: any) => {
    // Find which field/column changed
    const changedFields = Object.keys(newRow).filter(field => newRow[field] !== oldRow[field]);

    if (changedFields.length === 0) {
      return oldRow;
    }
    const changedField = changedFields[0]; // Usually only one field changes at a time

    // If you need the column index instead of field name
    const columnIndex = columns.findIndex(col => col.field === changedField).toString();

    // the field is a stringified index of the column
    // We want to find the table i.e. the alias of the table for the column
    const alias = session.columnMetadata.colIndexToAliasLookup[columnIndex];
    const idColumnIndex = session.columnMetadata.aliasToIdLookup[alias];
    if (!idColumnIndex) {
      console.error('No id column index found for alias:', alias);
      return oldRow;
    }
    const id = newRow[idColumnIndex];
    const column = session.columnMetadata.colIndexToColumnLookup[columnIndex];

    // For default behavior (Enter/Esc), execute the update directly without showing modal
    // The modal is only shown when the inspect icon is clicked
    try {
      // Create the update expression using the helper function
      const updateExpression = await createUpdateExpression(
        session.expression,
        alias,
        id,
        column,
        newRow[columnIndex],
      );

      // Get virtual session and execute the update
      const vs = global.getVirtualSession();
      runInAction(() => {
        vs.expression = updateExpression;
      });
      await vs.evaluate();

      // Refresh the main session
      await session.evaluate();
    } catch (error) {
      console.error('Direct update failed:', error);
    }

    // Return newRow for optimistic update
    return newRow;
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
  // only) - mirrors CellEditComponent's handleInspectClick below, minified
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

  // Custom edit component that shows inspect icon during editing
  const CellEditComponent = (props: any) => {
    const { id, field, value, api, ...other } = props;
    const [inputValue, setInputValue] = useState(value ?? '');

    const handleInspectClick = async () => {
      // Find the column information
      const columnIndex = field;
      const alias = session.columnMetadata.colIndexToAliasLookup[columnIndex];
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
      const column = session.columnMetadata.colIndexToColumnLookup[columnIndex];

      // Create the update expression
      const updateExpression = await createUpdateExpression(
        session.expression,
        alias,
        rowId,
        column,
        inputValue,
      );

      // Prepare update data and show modal
      setUpdateData({
        column,
        id: rowId,
        value: inputValue,
        alias,
        updateExpression, // Add the pre-built expression
      });

      // Exit edit mode
      api.stopCellEditMode({ id, field });
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') {
        // Default behavior - save and exit
        api.stopCellEditMode({ id, field });
      } else if (event.key === 'Escape') {
        // Default behavior - cancel and exit
        api.stopCellEditMode({ id, field, ignoreModifications: true });
      }
    };

    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          position: 'relative',
        }}
      >
        <input
          value={inputValue}
          onChange={e => {
            setInputValue(e.target.value);
            api.setEditCellValue({ id, field, value: e.target.value });
          }}
          onKeyDown={handleKeyDown}
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            width: '100%',
            height: '100%',
            padding: '8px 32px 8px 8px', // Add right padding for the icon
            fontSize: 'inherit',
            color: 'inherit',
            fontFamily: 'inherit',
          }}
          autoFocus
          {...other}
        />
        <Tooltip title="Inspect Update (opens update modal)">
          <IconButton
            size="small"
            onClick={handleInspectClick}
            aria-label="Inspect update"
            sx={{
              position: 'absolute',
              right: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              borderRadius: '4px',
              backgroundColor: 'var(--canvas-node-bg)',
              border: '1px solid var(--canvas-node-border)',
              color: 'var(--canvas-trace)',
              '&:hover': {
                backgroundColor: 'var(--canvas-chip-bg)',
              },
              width: 24,
              height: 24,
            }}
          >
            <Code fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    );
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
      className="copy-data-grid"
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
          <Box
            sx={{ position: 'absolute', inset: 0 }}
            onContextMenu={(event: React.MouseEvent) => {
              // Find the cell that was right-clicked
              const target = event.target as HTMLElement;
              const cell = target.closest('.MuiDataGrid-cell');
              if (cell) {
                event.preventDefault();
                const fieldAttr = cell.getAttribute('data-field');
                const rowElement = cell.closest('.MuiDataGrid-row');
                if (fieldAttr && rowElement) {
                  const rowIndexAttr = rowElement.getAttribute('data-rowindex');
                  if (rowIndexAttr) {
                    const rowIndex = parseInt(rowIndexAttr, 10);
                    const rowData = rows[rowIndex];
                    if (rowData) {
                      const params = {
                        field: fieldAttr,
                        value: rowData[fieldAttr],
                        row: rowData,
                      };
                      handleContextMenu(event, params);
                    }
                  }
                }
              }
            }}
          >
            {/* Unmounted (not just hidden) while resultsSettling is true -
                see the placeholder overlay's own comment for what that
                buys over merely covering an unmounted grid. */}
            {!resultsSettling && (
              <DataGrid
                sx={{
                  height: '100%',
                  '--DataGrid-containerBackground': 'var(--canvas-node-bg)',
                  '--DataGrid-rowBorderColor': 'var(--canvas-node-border)',
                  color: 'var(--canvas-text)',
                  // Tabular data benefits from the same monospace alignment
                  // code does - --code-font, not --canvas-font (the UI font),
                  // unlike the surrounding chrome (empty-state text, icon
                  // buttons, context menu) in this same file.
                  fontFamily: 'var(--code-font)',
                  // rem, not calc(...* var(--text-scale)) like the other code-
                  // surface font sizes in this file/Query.tsx/editor-theme.ts -
                  // those are px literals unaffected by the root font-size
                  // change pages/_app.tsx now also makes, but this one IS rem,
                  // so it already scales via inheritance; multiplying by
                  // --text-scale too would double-apply the scale.
                  fontSize: '0.875rem',
                  border: '1px solid var(--canvas-node-border)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                  '& .MuiDataGrid-withBorderColor': {
                    borderColor: 'transparent',
                  },
                  // A tonal step up from the body (the same "labeled section"
                  // idea as canvas mode's picker group headers), not just a
                  // border, so the header row reads as its own row rather
                  // than the first row of data.
                  '& .MuiDataGrid-columnHeaders': {
                    backgroundColor: 'var(--canvas-chip-bg)',
                    borderBottom: '1px solid var(--canvas-node-border)',
                  },
                  '& .MuiDataGrid-columnHeaderTitle': {
                    color: 'var(--canvas-text)',
                    fontWeight: 600,
                  },
                  '& .MuiDataGrid-cell': {
                    color: 'var(--canvas-text)',
                    borderBottom: '1px solid var(--canvas-node-border)',
                    userSelect: 'none', // Prevent text selection
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none',
                  },
                  ...columnColorSx,
                  ...hoveredColorSx,
                  '& .MuiDataGrid-row:hover': {
                    backgroundColor: 'var(--canvas-chip-bg)',
                  },
                  '& .MuiTablePagination-root, & .MuiTablePagination-root .MuiSvgIcon-root, & .MuiTablePagination-root .MuiIconButton-root':
                    {
                      color: 'var(--canvas-text-dim)',
                      fontFamily: 'var(--canvas-font)',
                    },
                  '& ::-webkit-scrollbar': {
                    width: '10px',
                    height: '10px',
                  },
                  '& ::-webkit-scrollbar-track': {
                    background: 'transparent',
                  },
                  '& ::-webkit-scrollbar-thumb': {
                    backgroundColor: 'var(--canvas-pin)',
                    borderRadius: '5px',
                  },
                  '& ::-webkit-scrollbar-thumb:hover': {
                    background: 'var(--canvas-trace)',
                  },
                }}
                density="compact"
                rows={rows}
                columns={columns}
                getRowId={row => row._id ?? ''}
                columnVisibilityModel={session.columnVisibilityModel}
                processRowUpdate={updateRecord}
                onColumnWidthChange={handleColumnWidthChange}
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
                  {visibleColumnsForSettling.map(col => {
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
                        {col.headerName}
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
                    {visibleColumnsForSettling.map((col, colIndex) => (
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
