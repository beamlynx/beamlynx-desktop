import React, { ReactElement } from "react";

import TextField from '@mui/material/TextField';
import { Box } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "./store/container";

const PineInput = observer(() => {
    const { store } = useStores();
    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      store.expression = e.target.value;
      await store.buildQuery();
    } 
    const handleEnter = async (e: React.KeyboardEvent) => {
        if (e.key !== 'Enter') {
          return;
        }
        await store.evaluate();
    }
    return (
        <TextField autoFocus variant='outlined' fullWidth onChange={handleChange} onKeyDown={handleEnter} />
    );
  });

export default PineInput;