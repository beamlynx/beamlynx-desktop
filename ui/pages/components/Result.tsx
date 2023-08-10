import { DataGrid } from '@mui/x-data-grid';
import { toJS } from "mobx";
import { observer } from "mobx-react-lite";
import React from "react";
import { useStores } from '../store/container';

const Result = observer(() => {
    const { store } = useStores();
    const rows = toJS(store.rows); 
    const columns = toJS(store.columns); 
    return (
            <div>
                    {!store.loaded ||
                        <DataGrid
                            autoHeight={true}
                            density="compact"
                            rows={rows}
                            columns={columns}
                            getRowId={() => Math.random()*100000}
                            
                        />
                    }
            </div>
    );
  });

export default Result;