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

  const handleKeyPress = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      const candidate = graph.getCandidate();
      if (candidate) {
        const { schema, table } = candidate;
        global.updateExpressionUsingCandidate(schema, table);
        await global.buildQuery();
      } else {
        await global.evaluate();
      }
      graph.resetCandidate();
    }

    // Navigate the candidates
    if (e.key === 'Tab') {
      e.preventDefault();
      graph.selectNextCandidate(e.shiftKey ? -1 : 1);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      graph.selectNextCandidate(-1);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      graph.selectNextCandidate(1);
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
