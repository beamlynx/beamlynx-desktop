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
    const candidate = graph.getCandidate();

    if (global.mode === 'result') {
      global.setMode('input');
    } else if (global.mode === 'input') {
      if (e.key === 'Tab') {
        e.preventDefault();
        global.setMode('graph');
        if (!candidate) {
          selectNextCandidate(1);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        await global.evaluate();
      }
    } else if (global.mode === 'graph') {
      if (e.key === 'Escape') {
        e.preventDefault();
        global.setMode('input');
      } else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        global.setMode('input');
      } else if (e.shiftKey) {
        e.preventDefault();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        // selectNextCandidate(e.shiftKey ? -1 : 1);
        selectNextCandidate(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectNextCandidate(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectNextCandidate(1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (candidate) {
          global.updateExpressionUsingCandidate(candidate);
          await global.buildQuery();
          global.setMode('input');
        }
      } else {
        e.preventDefault();
        global.setMode('input');
      }
    }
  };

  return (
    <TextField
      label="Pine expression... "
      value={global.expression}
      size="small"
      variant="outlined"
      focused={global.mode === 'input'}
      onFocus={() => {
        global.setMode('input');
      }}
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
