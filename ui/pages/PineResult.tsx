import React from "react";

import { observer } from "mobx-react-lite";
import { useStores } from "./store/container";
import { DataGrid, GridColumns, GridRowsProp } from '@mui/x-data-grid';
import { toJS } from "mobx";

const PineResult = observer(() => {
    const { store } = useStores();
    const rows = toJS(store.rows); 
    const columns = toJS(store.columns); 
    return (
        <div style={{ height: 400, width: '100%'}}>
            <DataGrid
                rows={rows}
                columns={columns}
                pageSize={5}
                getRowId={() => Math.random()*100000}
            />
        </div>
    );
  });

export default PineResult;