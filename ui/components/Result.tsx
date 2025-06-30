import { DataGrid } from '@mui/x-data-grid';
import { toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStores } from '../store/store-container';
import { Box } from '@mui/material';

interface ResultProps {
  sessionId: string;
}

const Result: React.FC<ResultProps> = observer(({ sessionId }) => {
  const { global: store } = useStores();
  const session = store.getSession(sessionId);
  const rows = toJS(session.rows);
  const columns = toJS(session.columns);

  if (columns.length === 0) {
    return <div style={{ textAlign: 'center', color: 'gray', padding: '20px' }}>No results</div>;
  }

  return (
    <div className="copy-data-grid">
      {/* The following Box wrapppers were added because the grid was not
      respecting the max width. Hack taken from here:
      https://github.com/mui/mui-x/issues/8895#issuecomment-1793433389*/}
      <Box sx={{ flex: 1, position: 'relative' }}>
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
