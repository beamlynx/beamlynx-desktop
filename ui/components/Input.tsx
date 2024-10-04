import TextField from '@mui/material/TextField';
import { observer } from 'mobx-react-lite';
import React, { useRef } from 'react';
import { evaluate } from '../plugin/plugin';
import { useStores } from '../store/store-container';
import { Response } from '../store/http';

interface InputProps {
  sessionId: string;
}

const Input: React.FC<InputProps> = observer(({ sessionId }) => {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const { global, graph } = useStores();
  const session = global.getSession(sessionId);

  const handleChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const expression = e.target.value;
    session.expression = expression;
    await global.buildQuery(sessionId);
  };

  const selectNextCandidate = (sessionId: string, index: number) => {
    const session = global.getSession(sessionId);
    graph.selectNextCandidate(sessionId, index);
    const candidate = graph.getCandidate();
    session.message = candidate ? candidate.pine : '';
  };

  const shouldPrettify = () => {
    const cursorPosition = inputRef.current ? inputRef.current.selectionStart : 0;
    const expressionLength = session.expression.length;
    return cursorPosition === expressionLength;
  };

  const handleKeyPress = async (sessionId: string, e: React.KeyboardEvent) => {
    const session = global.getSession(sessionId);
    const candidate = graph.getCandidate();

    if (session.mode === 'result') {
      global.setMode(sessionId, 'input');
    } else if (session.mode === 'input') {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (session.expression) {
          global.setMode(sessionId, 'graph');
          if (!candidate) {
            selectNextCandidate(sessionId, 1);
          }
        }
      } else if (e.key === '|') {
        if (shouldPrettify()) {
          e.preventDefault();
          global.prettifyExpression(sessionId);
        }
        await global.buildQuery(sessionId);
      } else if (e.key === 'Enter') {
        e.preventDefault();

        if (!global.connected) {
          global.handleError(sessionId, { error: 'Not connected' } as Response);
          return;
        }
        await evaluate(session, global);
      }
    } else if (session.mode === 'graph') {
      if (e.key === 'Escape') {
        e.preventDefault();
        global.setMode(sessionId, 'input');
      } else if (e.key === 'Enter' || e.key === '|') {
        e.preventDefault();
        if (candidate) {
          global.updateExpressionUsingCandidate(sessionId, candidate);
          await global.buildQuery(sessionId);
          global.setMode(sessionId, 'input');
        }
      } else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        selectNextCandidate(sessionId, -1);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        selectNextCandidate(sessionId, 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectNextCandidate(sessionId, -1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectNextCandidate(sessionId, 1);
      } else if (e.key.length === 1) {
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
      inputRef={inputRef}
      onChange={handleChange}
      onKeyDown={e => {
        handleKeyPress(sessionId, e);
      }}
    />
  );
});

export default Input;
