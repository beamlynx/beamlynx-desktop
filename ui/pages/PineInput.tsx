import React, { ReactElement } from "react";

import TextField from '@mui/material/TextField';
import { Box } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "./store/container";

const PineInput = observer(() => {
    const { store } = useStores();
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      store.expression = e.target.value;
    } 
    const handleEnter = async (e: React.KeyboardEvent) => {
        if (e.key !== 'Enter') {
          return;
        }
        await store.buildQuery();
    }
    return (
        <Box sx={{ my: 2}}>
            <TextField autoFocus variant='outlined' fullWidth onChange={handleChange} onKeyDown={handleEnter}></TextField>
        </Box>
    );
  });

export default PineInput;