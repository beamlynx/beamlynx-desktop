import React, { ReactElement } from "react";

import TextField from '@mui/material/TextField';
import { Box, TextareaAutosize } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "./store/container";

const PineInput = observer(() => {
    const { store } = useStores();
    const handleChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      store.expression = e.target.value;
      await store.buildQuery();
    } 
    
    // Return the updated string and the new position of the cursor
    const addPipe = (target: HTMLTextAreaElement): [string, number] => {
        const index = target.selectionStart
        const v = target.value;
        const updated = v.slice(0, index) + "\n | " + v.slice(index);
        return [updated, index + 4];
    }

    const handleEnter = async (e: React.KeyboardEvent) => {
        if (e.key === '|') {
          e.preventDefault();
          const target = e.target as HTMLTextAreaElement;
          const [value, index] = addPipe(target);
          target.value = value;
          target.selectionEnd = index
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          await store.evaluate();
        }
    }
    return (
        // <TextareaAutosize
        //   autoFocus
        //   minRows="10"
        //   maxRows="10"
        //   onChange={handleChange}
        //   onKeyDown={handleEnter}
        //   />
        <TextField
          variant="outlined"
          autoFocus
          multiline
          fullWidth
          minRows="10"
          maxRows="10"
          onChange={handleChange}
          onKeyDown={handleEnter}
          />
    );
  });

export default PineInput;