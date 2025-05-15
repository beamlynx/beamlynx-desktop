import TextField from '@mui/material/TextField';
import { observer } from 'mobx-react-lite';
import React, { useEffect, useRef } from 'react';
import { useStores } from '../store/store-container';
import { prettifyExpression } from '../store/util';
import { Box, Button } from '@mui/material';
import { KeyboardReturn, Loop } from '@mui/icons-material';
interface InputProps {
  sessionId: string;
}

const Input: React.FC<InputProps> = observer(({ sessionId }) => {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const { global } = useStores();
  const session = global.getSession(sessionId);

  /**
   * Only prettify if `|` is added at the end of the expression
   */
  const shouldPrettify = () => {
    const cursorPosition = inputRef.current ? inputRef.current.selectionStart : 0;
    return cursorPosition === session.expression.length;
  };

  /**
   * Checks if a key is a printable character.
   *
   * Control characters are in these Unicode ranges:
   * - \u0000-\u001F: C0 controls (tab, newline, backspace, etc)
   * - \u007F: Delete
   * - \u0080-\u009F: C1 controls (additional control codes like single-shift characters,
   *                  private use characters, etc - rarely used in modern systems)
   *
   * @param key The key to check
   * @returns True if the key is a printable character, false if it's a control character
   */
  const isPrintableChar = (key: string) => {
    return key.length === 1 && !key.match(/[\u0000-\u001F\u007F-\u009F]/);
  };
  const isModifierKeyCombo = (e: React.KeyboardEvent) => {
    return e.ctrlKey || e.metaKey || e.altKey || e.key === 'Meta';
  };

  /**
   * Handles all keyboard interactions in the input component.
   * The behavior changes based on the current mode (result, input, or graph)
   *
   * Result mode:
   * - Any key press switches back to input mode
   *
   * Input mode:
   * - `Tab`: Switches to graph mode and selects first candidate
   * - `|`: Prettifies the expression if cursor is at the end
   * - `Enter`: Evaluates the current expression
   * - Any other key: Marks results as not loaded
   *
   * Graph mode:
   * - `Escape`: Returns to input mode
   * - `Enter` / `|`: Selects current candidate and returns to input mode
   * - `Tab`: Cycles through candidates (`Shift+Tab` for reverse)
   * - `Arrow Up`/`Down`: Navigate between candidates
   * - Printable chars: Append to expression and switch to input mode
   *
   * Global behaviors:
   * - Blocks all actions if not connected
   * - Allows modifier key combinations (`Ctrl` / `Cmd`) to pass through
   */
  const handleKeyPress = async (e: React.KeyboardEvent) => {
    if (!global.connected) {
      session.error = 'Not connected';
      return;
    }

    if (isModifierKeyCombo(e)) {
      return;
    }

    if (session.input) {
      if (session.mode === 'documentation') {
        session.mode = 'graph';
      }

      switch (e.key) {
        case 'Tab':
          e.preventDefault();
          session.mode = 'graph';
          session.input = false;
          session.selectNextCandidate(1);
          return;
        case '|':
          if (!shouldPrettify()) return;
          e.preventDefault();
          session.expression = prettifyExpression(session.expression);
          return;
        case 'Enter':
          e.preventDefault();
          await handleEvaluate();
          return;
      }

      session.mode = 'graph';
      return;
    }

    switch (session.mode) {
      case 'result':
        session.input = true;
        return;

      case 'graph':
        switch (e.key) {
          case 'Escape':
            e.preventDefault();
            session.input = true;
            return;
          case 'Enter':
          case '|':
            e.preventDefault();
            session.input = true;
            session.updateExpressionUsingCandidate();
            return;
          case 'Tab':
            e.preventDefault();
            session.selectNextCandidate(e.shiftKey ? -1 : 1);
            return;
          case 'ArrowUp':
            e.preventDefault();
            session.selectNextCandidate(-1);
            return;
          case 'ArrowDown':
            e.preventDefault();
            session.selectNextCandidate(1);
            return;
          default:
            if (!isPrintableChar(e.key)) {
              return;
            }
            e.preventDefault();
            session.input = true;
            session.expression = session.expression + e.key;
            return;
        }
    }
  };

  const handleExpressionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    session.expression = e.target.value;
  };

  const handleEvaluate = async () => {
    await session.evaluate();
  };

  const isConnected = global.connected && global.getConnectionName();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <TextField
        id="input"
        label="Pine expression... "
        value={isConnected ? session.expression : '\n - not connected - '}
        size="small"
        variant="outlined"
        focused={session.input}
        onFocus={() => {
          session.input = true;
        }}
        multiline
        fullWidth
        minRows="8"
        maxRows="15"
        inputRef={inputRef}
        onChange={handleExpressionChange}
        onKeyDown={handleKeyPress}
        disabled={!isConnected}
        InputProps={{
          style: {
            fontFamily: 'monospace',
            fontSize: '0.875rem', // 14px
          },
        }}
      />
      <Button
        variant="contained"
        onClick={handleEvaluate}
        disabled={!session.expression || session.loading}
        sx={{ alignSelf: 'flex-end', mt: 1 }}
        startIcon={session.loading ? <Loop /> : <KeyboardReturn />}
      >
        Run
      </Button>
    </Box>
  );
});

export default Input;
