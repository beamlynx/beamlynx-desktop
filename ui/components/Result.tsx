import { DataGrid } from '@mui/x-data-grid';
import { toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStores } from '../store/store-container';
import { Box, IconButton, Tooltip, useTheme, useMediaQuery } from '@mui/material';
import { FileDownload } from '@mui/icons-material';

interface ResultProps {
  sessionId: string;
}

const Result: React.FC<ResultProps> = observer(({ sessionId }) => {
  const { global: store } = useStores();
  const session = store.getSession(sessionId);
  const rows = toJS(session.rows);
  const columns = toJS(session.columns);
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('lg'));
  const compactMode = isSmallScreen || session.forceCompactMode;

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
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          })
          .join(',')
      )
    ];

    // Create and download the file
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `pine-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`);
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
              ...(compactMode ? {
                top: 0,
                right: -44,
              } : {
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
        <Box sx={{ position: 'absolute', inset: 0 }}>
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
            onCellClick={(x, y) => {
              const v = x.row[x.field];
              navigator.clipboard.writeText(v).then(() => {
                store.setCopiedMessage(sessionId, v, true);
              });
            }}
          />
        </Box>
      </Box>
    </div>
  );
});

export default Result;
