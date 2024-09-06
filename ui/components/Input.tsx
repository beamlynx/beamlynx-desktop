import React from 'react';
import TextField from '@mui/material/TextField';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';

interface InputProps {
  sessionId: string;
}

const Input: React.FC<InputProps> = observer(({ sessionId }) => {
  const { global, graph } = useStores();
  const session = global.getSession(sessionId);

  const handleChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const expression = e.target.value;
    session.expression = expression;
    await global.buildQuery(sessionId);
  };

  const selectNextCandidate = (index: number) => {
    graph.selectNextCandidate(sessionId, index);
    const candidate = graph.getCandidate();
    global.message = candidate ? candidate.pine : '';
  };

  const handleKeyPress = async (e: React.KeyboardEvent) => {
    const candidate = graph.getCandidate();

    if (session.mode === 'result') {
      global.setMode(sessionId, 'input');
    } else if (session.mode === 'input') {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (session.expression) {
          global.setMode(sessionId, 'graph');
          if (!candidate) {
            selectNextCandidate(1);
          }
        }
      } else if (e.key === '|') {
        e.preventDefault();
        global.prettifyExpression(sessionId);
        await global.buildQuery(sessionId);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        await global.evaluate(sessionId);
      }
    } else if (session.mode === 'graph') {
      if (e.key === 'Escape') {
        e.preventDefault();
        global.setMode(sessionId, 'input');
      } else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        global.setMode(sessionId, 'input');
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
          global.updateExpressionUsingCandidate(sessionId, candidate);
          await global.buildQuery(sessionId);
          global.setMode(sessionId, 'input');
        }
      } else {
        e.preventDefault();
        global.setMode(sessionId, 'input');
        session.expression += e.key;
      }
    }
  };

  return (
    <TextField
      id="input"
      label="Pine expression... "
      value={session.expression}
      size="small"
      variant="outlined"
      focused={session.mode === 'input'}
      onFocus={() => {
        global.setMode(sessionId, 'input');
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
