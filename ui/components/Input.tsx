import TextField from '@mui/material/TextField';
import { observer } from 'mobx-react-lite';
import React, { useRef } from 'react';
import { useStores } from '../store/store-container';
import { prettifyExpression } from '../store/util';

interface InputProps {
  sessionId: string;
}

const Input: React.FC<InputProps> = observer(({ sessionId }) => {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const { global } = useStores();
  const session = global.getSession(sessionId);

  const handleChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    session.expression = e.target.value;
  };

  /**
   * Only prettify if `|` is added at the end of the expression
   */
  const shouldPrettify = () => {
    const cursorPosition = inputRef.current ? inputRef.current.selectionStart : 0;
    const expressionLength = session.expression.length;
    return cursorPosition === expressionLength;
  };

  const isPrintableChar = (key: string) => {
    return key.length === 1;
  };

  /**
   * TODO: instead of creating the expression manually, let's get the value of
   * the input from the text field and adjust accordingly.
   * The key characters that need special handling are for navigation:
   *
   * Input mode:
   * - TAB: switch to graph mode
   * - Enter: evaluate the expression
   *
   * Graph mode:
   * - Arrow keys: select next/previous candidate
   * - TAB: select next candidate
   * - Shift + TAB: select previous candidate
   * - Escape: switch to input mode
   *
   * Result mode:
   * - Escape: switch to input mode
   *
   * Globally:
   * - |: prettify the expression
   */
  const handleKeyPress = async (e: React.KeyboardEvent) => {
    if (!global.connected) {
      session.error = 'Not connected';
      return;
    }

    if (e.ctrlKey) {
      // Allow control key combinations to pass through
      return;
    }

    if (session.mode === 'result') {
      session.loaded = false;
      session.mode = 'input';
    } else if (session.mode === 'input') {
      if (e.key === 'Tab') {
        e.preventDefault();
        session.mode = 'graph';
        session.selectNextCandidate(1);
      } else if (e.key === '|') {
        if (shouldPrettify()) {
          e.preventDefault();
          session.expression = prettifyExpression(session.expression);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        session.evaluate();
      } else if (isPrintableChar(e.key)) {
        e.preventDefault();
        session.loaded = false;
        session.expression = session.expression + e.key;
        session.mode = 'input';
      }
    } else if (session.mode === 'graph') {
      if (e.key === 'Escape') {
        e.preventDefault();
        session.mode = 'input';
      } else if (e.key === 'Enter' || e.key === '|') {
        e.preventDefault();
        session.mode = 'input';
        session.updateExpressionUsingCandidate();
      } else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        session.selectNextCandidate(-1);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        session.selectNextCandidate(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        session.selectNextCandidate(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        session.selectNextCandidate(1);
      } else if (isPrintableChar(e.key)) {
        e.preventDefault();
        session.mode = 'input';
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
        session.mode = 'input';
      }}
      multiline
      fullWidth
      minRows="8"
      maxRows="15"
      inputRef={inputRef}
      onChange={handleChange}
      onKeyDown={handleKeyPress}
      disabled={!global.connected}
    />
  );
});

export default Input;
