import React, { ReactElement } from "react";

import TextField from '@mui/material/TextField';
import { Box, TextareaAutosize } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "../store/store-container";

const Input = observer(() => {
    const { global: store } = useStores();
    const handleChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      store.expression = e.target.value;
      await store.buildQuery();
    } 

    const handleKeyPress = async (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await store.evaluate();
        }
    }

    return (
        <TextField
          label="Pine expression... "
          // hiddenLabel={true}
          size="small"
          variant="outlined"
          autoFocus
          // multiline
          fullWidth
          minRows="1"
          maxRows="1"
          onChange={handleChange}
          onKeyDown={handleKeyPress}
          />
    );
  });

export default Input;