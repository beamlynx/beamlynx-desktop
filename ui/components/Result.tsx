import { DataGrid } from '@mui/x-data-grid';
import { toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStores } from '../store/store-container';

const Result = observer(() => {
  const { global: store } = useStores();
  const rows = toJS(store.rows);
  const columns = toJS(store.columns);
  return (
    <div>
      {!store.loaded || (
        <DataGrid
          density="compact"
          rows={rows}
          columns={columns}
          getRowId={row => row._id ?? ""}
          onCellClick={(x, y) => {
            const v = x.row[x.field];
            navigator.clipboard.writeText(v);
            console.log(x);
            console.log(y);
            store.message = `📋 Copied: '${v}'`;
          }}
        />
      )}
    </div>
  );
});

export default Result;
