import { DataGrid } from '@mui/x-data-grid';
import { toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStores } from '../store/store-container';

interface ResultProps {
  sessionId: string;
}

const Result: React.FC<ResultProps> = observer(({ sessionId }) => {
  const { global: store } = useStores();
  const session = store.getSession(sessionId);
  const rows = toJS(session.rows);
  const columns = toJS(session.columns);
  return (
    <div className="copy-data-grid">
      {session.loaded && (
        <DataGrid
          density="compact"
          rows={rows}
          columns={columns}
          getRowId={row => row._id ?? ''}
          onCellClick={(x, y) => {
            const v = x.row[x.field];
            navigator.clipboard.writeText(v).then(() => {
              store.setCopiedMessage(v, true);
            });
          }}
        />
      )}
    </div>
  );
});

export default Result;
