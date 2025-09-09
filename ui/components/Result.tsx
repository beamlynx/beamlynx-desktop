import { DataGrid } from '@mui/x-data-grid';
import { toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import React, { useState, useEffect } from 'react';
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
import { FileDownload, ContentCopy, FilterAlt } from '@mui/icons-material';
import UpdateModal from './UpdateModal';

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
}

const Result: React.FC<ResultProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
  const virtualSession = global.getVirtualSession();
  const rows = toJS(session.rows);
  const columns = toJS(session.columns);
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('lg'));
  const compactMode = isSmallScreen || session.forceCompactMode;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [updateData, setUpdateData] = useState<UpdateData | undefined>(undefined);



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
    const changedFields = Object.keys(newRow).filter(
      field => newRow[field] !== oldRow[field],
    );

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

    // Prepare update data and show modal
    setUpdateData({
      column,
      id,
      value: newRow[columnIndex],
      alias,
    });
    
    // Set updating flag to show modal
    session.updating = true;

    // TODO: how to handle the case when the user cancels the update? or it fails?
    return newRow;
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

    // Create and download the file
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `pine-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`,
      );
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
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
          />
        </Box>
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
      {updateData && <UpdateModal session={session} updateData={updateData}/>}
    </div>
  );
});

export default Result;
