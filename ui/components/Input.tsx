import React from 'react';
import TextField from '@mui/material/TextField';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';

const Input = observer(() => {
  const { global, graph } = useStores();

  const handleChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const expression = e.target.value;
    global.expression = expression;
    await global.buildQuery();
  };

  const selectNextCandidate = (index: number) => {
    graph.selectNextCandidate(index);
    const candidate = graph.getCandidate();
    global.message = candidate ? candidate.pine : '';
  };

  const handleKeyPress = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      const candidate = graph.getCandidate();
      if (e.ctrlKey) {
        await global.evaluate();
      } else if (candidate) {
        global.updateExpressionUsingCandidate(candidate);
        await global.buildQuery();
      } else {
        global.message = '💡 Are you trying to get the results? Use `Ctrl + Enter` instead!';
      }

      graph.resetCandidate();
    }

    // Navigate the candidates
    if (e.key === 'Tab') {
      e.preventDefault();
      selectNextCandidate(e.shiftKey ? -1 : 1);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectNextCandidate(-1);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectNextCandidate(1);
    }
  };

  return (
    <TextField
      label="Pine expression... "
      value={global.expression}
      // hiddenLabel={true}
      size="small"
      variant="outlined"
      autoFocus
      multiline
      fullWidth
      minRows="8"
      maxRows="15"
      onChange={handleChange}
      onKeyDown={handleKeyPress}
    />
  );
});

export default Input;
