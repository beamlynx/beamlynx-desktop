import { DataGrid } from '@mui/x-data-grid';
import { toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import React, { useState, useEffect, useRef } from 'react';
import { useStores } from '../store/store-container';
import {
  Box,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  FileDownload,
  ContentCopy,
  FilterAlt,
  Code,
  BarChart as BarChartIcon,
} from '@mui/icons-material';
import UpdateModal from './UpdateModal';
import DownloadResultsModal from './DownloadResultsModal';
import { pineEscape } from '../store/util';
import { getColorForAlias, shouldShowTableColors } from '../store/table-colors.util';
import { BarChart } from './BarChart';

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

interface EditingCell {
  id: string | number;
  field: string;
}

const Result: React.FC<ResultProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
  const rows = toJS(session.rows);
  const baseColumns = toJS(session.columns);

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const colIndexToAlias = session.columnMetadata.colIndexToAliasLookup;

  const showResultColors = shouldShowTableColors(global.pineTableColorsEnabled, session);

  // Add custom edit component and column color classes by table alias
  const columns = baseColumns.map(column => {
    const alias = colIndexToAlias[column.field] ?? '';
    const aliasClass =
      showResultColors && alias ? `result-col-${alias.replace(/[^a-z0-9_]/gi, '_')}` : '';
    return {
      ...column,
      renderEditCell: (params: any) => <CellEditComponent {...params} />,
      ...(aliasClass && {
        headerClassName: aliasClass,
        cellClassName: aliasClass,
      }),
    };
  });

  const ast = session.response?.ast ?? null;
  const uniqueAliases = Array.from(new Set(Object.values(colIndexToAlias).filter(Boolean)));
  const columnColorSx =
    showResultColors && uniqueAliases.length
      ? Object.fromEntries(
          uniqueAliases.flatMap(alias => {
            const safeClass = `result-col-${alias.replace(/[^a-z0-9_]/gi, '_')}`;
            const color = getColorForAlias(alias, ast, isDark);
            return [
              [`& .MuiDataGrid-columnHeader.${safeClass}`, { backgroundColor: color }],
              [`& .MuiDataGrid-cell.${safeClass}`, { backgroundColor: color }],
            ];
          }),
        )
      : {};
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('lg'));
  const compactMode = isSmallScreen || global.forceCompactMode;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [updateData, setUpdateData] = useState<UpdateData | undefined>(undefined);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
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
      navigator.clipboard.writeText(String(contextMenu.cellValue)).then(() => {
        global.setCopiedMessage(sessionId, contextMenu.cellValue, true);
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

    const column = columns[parseInt(contextMenu.fieldIndex)];
    if (column?.headerName) {
      session.pipeAndUpdateExpression(
        `where: ${column.headerName} = '${contextMenu.cellValue}'`,
        false,
      );
      await session.evaluate();
    } else {
      console.error('Column missing header name for filter action:', {
        fieldIndex: contextMenu.fieldIndex,
        column,
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
      const updateExpression = createUpdateExpression(
        session.expression,
        alias,
        id,
        column,
        newRow[columnIndex],
      );

      // Get virtual session and execute the update
      const vs = global.getVirtualSession();
      vs.expression = updateExpression;
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
  const createUpdateExpression = (
    baseExpression: string,
    alias: string,
    id: string | number,
    column: string,
    value: string,
  ) => {
    const vs = global.getVirtualSession();

    // Reset virtual session state
    vs.setMessage('');
    vs.error = '';
    vs.loading = false;
    vs.setInputMode('pine');

    // Set up the update query
    vs.expression = baseExpression;
    vs.prettify();
    vs.pipeAndUpdateExpression(`from: ${alias}`);
    vs.pipeAndUpdateExpression(
      `where: id = ${Number.isInteger(id) ? parseInt(id as string, 10) : `'${pineEscape(id as string)}'`}`,
    );
    vs.pipeAndUpdateExpression(`update! ${column} = '${pineEscape(value)}'`);

    return vs.expression;
  };

  // Custom edit component that shows inspect icon during editing
  const CellEditComponent = (props: any) => {
    const { id, field, value, api, ...other } = props;
    const [inputValue, setInputValue] = useState(value ?? '');

    const handleInspectClick = () => {
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
      const updateExpression = createUpdateExpression(
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
            sx={{
              position: 'absolute',
              right: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              backgroundColor: 'var(--background-color)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-color)',
              '&:hover': {
                backgroundColor: 'var(--node-bg)',
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

    // Get column headers (excluding the _id column if present)
    const headers = columns
      .filter(col => col.field !== '_id')
      .map(col => col.headerName || col.field);

    // Convert rows to CSV format
    const csvRows = [
      headers.join(','), // Header row
      ...rows.map(row =>
        columns
          .filter(col => col.field !== '_id')
          .map(col => {
            const value = row[col.field];
            // Handle values that might contain commas, quotes, or newlines
            if (value === null || value === undefined) {
              return '';
            }
            const stringValue = String(value);
            if (
              stringValue.includes(',') ||
              stringValue.includes('"') ||
              stringValue.includes('\n')
            ) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          })
          .join(','),
      ),
    ];

    // Create CSV content and open modal
    const csvContent = csvRows.join('\n');
    const defaultFilename = `pine-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;

    setExportData({ filename: defaultFilename, csvContent });
    setExportModalOpen(true);
  };

  if (columns.length === 0) {
    return <div style={{ textAlign: 'center', color: 'gray', padding: '20px' }}>No results</div>;
  }

  return (
    <div className="copy-data-grid">
      {/* The following Box wrapppers were added because the grid was not
      respecting the max width. Hack taken from here:
      https://github.com/mui/mui-x/issues/8895#issuecomment-1793433389*/}
      <Box sx={{ flex: 1, position: 'relative' }}>
        {/* CSV Export Button */}
        <Tooltip title="Export to CSV">
          <IconButton
            onClick={exportToCSV}
            disabled={rows.length === 0}
            sx={{
              position: 'absolute',
              ...(compactMode
                ? {
                    top: 0,
                    right: -44,
                  }
                : {
                    top: -40,
                    right: 0,
                  }),
              zIndex: 1000,
              backgroundColor: 'var(--background-color)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-color)',
              '&:hover': {
                backgroundColor: 'var(--node-bg)',
              },
              '&:disabled': {
                opacity: 0.5,
                color: 'var(--icon-color)',
              },
            }}
            size="small"
          >
            <FileDownload fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Bar Chart Toggle Button */}
        {isBarChartSuitable() && (
          <Tooltip title={viewMode === 'table' ? 'View as Bar Chart' : 'View as Table'}>
            <IconButton
              onClick={() => setViewMode(viewMode === 'table' ? 'chart' : 'table')}
              sx={{
                position: 'absolute',
                ...(compactMode
                  ? {
                      top: 0,
                      right: -88,
                    }
                  : {
                      top: -40,
                      right: 44,
                    }),
                zIndex: 1000,
                backgroundColor: 'var(--background-color)',
                border: '1px solid var(--border-color)',
                color: viewMode === 'chart' ? '#8884d8' : 'var(--text-color)',
                '&:hover': {
                  backgroundColor: 'var(--node-bg)',
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
            <DataGrid
              sx={{
                '--DataGrid-containerBackground': 'var(--node-column-bg)',
                '--DataGrid-rowBorderColor': 'var(--border-color)',
                color: 'var(--text-color)',
                border: '1px solid var(--border-color)',
                borderRadius: 1,
                overflow: 'hidden',
                '& .MuiDataGrid-withBorderColor': {
                  borderColor: 'transparent',
                },
                '& .MuiDataGrid-columnHeaders': {
                  backgroundColor: 'var(--node-bg)',
                  borderBottom: '1px solid var(--border-color)',
                },
                '& .MuiDataGrid-columnHeaderTitle': {
                  color: 'var(--text-color)',
                },
                '& .MuiDataGrid-cell': {
                  color: 'var(--text-color)',
                  borderBottom: '1px solid var(--border-color)',
                  userSelect: 'none', // Prevent text selection
                  '-webkit-user-select': 'none',
                  '-moz-user-select': 'none',
                  '-ms-user-select': 'none',
                },
                ...columnColorSx,
                '& .MuiDataGrid-row:hover': {
                  backgroundColor: 'var(--node-bg)',
                },
                '& .MuiTablePagination-root, & .MuiTablePagination-root .MuiSvgIcon-root, & .MuiTablePagination-root .MuiIconButton-root':
                  {
                    color: 'var(--text-color)',
                  },
                '& ::-webkit-scrollbar': {
                  width: '10px',
                  height: '10px',
                },
                '& ::-webkit-scrollbar-track': {
                  background: 'transparent',
                },
                '& ::-webkit-scrollbar-thumb': {
                  backgroundColor: 'var(--node-handle-bg)',
                  borderRadius: '5px',
                },
                '& ::-webkit-scrollbar-thumb:hover': {
                  background: 'var(--text-color)',
                },
              }}
              density="compact"
              autoHeight={true}
              rows={rows}
              columns={columns}
              getRowId={row => row._id ?? ''}
              columnVisibilityModel={session.columnVisibilityModel}
              processRowUpdate={updateRecord}
              onCellEditStart={params => {
                setEditingCell({ id: params.id, field: params.field });
              }}
              onCellEditStop={() => {
                setEditingCell(null);
              }}
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
        >
          <MenuItem onClick={handleCopyAction}>
            <ListItemIcon>
              <ContentCopy fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Copy" />
          </MenuItem>
          <MenuItem onClick={handleFilterAction}>
            <ListItemIcon>
              <FilterAlt fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Filter" />
          </MenuItem>
        </Menu>
      )}

      {/* Update Modal */}
      {updateData && (
        <UpdateModal
          updateExpression={updateData.updateExpression}
          updateData={updateData}
          onClose={handleModalClose}
        />
      )}

      {/* Export Modal */}
      <DownloadResultsModal
        open={exportModalOpen}
        defaultFilename={exportData.filename}
        csvContent={exportData.csvContent}
        onClose={() => setExportModalOpen(false)}
      />
    </div>
  );
});

export default Result;
