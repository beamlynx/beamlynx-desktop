import TextField from '@mui/material/TextField';
import React, { useRef, useEffect } from 'react';
import { Session } from '../store/session';
import { prettifyExpression } from '../store/util';
import { observer } from 'mobx-react-lite';

interface TextInputProps {
  session: Session;
}

const TextInput: React.FC<TextInputProps> = observer(({ session }) => {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  /**
   * Global event handler for Ctrl+A
   */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;

      if (session.textInputFocused) {
        return;
      }

      // Disable Ctrl+A
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', fn);
    return () => {
      document.removeEventListener('keydown', fn);
    };
  }, []);

  /**
   * Global keyboard event handler for the input component.
   *
   * This handler ensures that the input field receives focus when the Escape key is pressed,
   * allowing users to quickly return to typing after navigating away from the input.
   */
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!inputRef.current) return;
      inputRef.current.focus();
    };

    window.addEventListener('keydown', handleEscapeKey);
    return () => {
      window.removeEventListener('keydown', handleEscapeKey);
    };
  }, [session.mode]);

  const shouldPrettify = () => {
    const cursorPosition = inputRef.current ? inputRef.current.selectionStart : 0;
    return cursorPosition === session.expression.length;
  };

  const isPrintableChar = (key: string) => {
    return key.length === 1 && !key.match(/[\u0000-\u001F\u007F-\u009F]/);
  };

  const isModifierKeyCombo = (e: React.KeyboardEvent) => {
    return e.ctrlKey || e.metaKey || e.altKey || e.key === 'Meta';
  };

  const handleKeyPress = async (e: React.KeyboardEvent) => {
    if (session.inputMode !== 'text') {
      return;
    }

    if (isModifierKeyCombo(e)) {
      return;
    }

    if (session.textInputFocused) {
      switch (e.key) {
        case 'Tab':
          e.preventDefault();
          session.mode = 'graph';
          session.textInputFocused = false;
          session.selectNextCandidate(1);
          return;
        case '|':
          if (!shouldPrettify()) return;
          e.preventDefault();
          session.expression = prettifyExpression(session.expression);
          return;
        case 'Enter':
          e.preventDefault();
          await session.evaluate();
          return;
      }

      session.mode = 'graph';
      return;
    }

    switch (session.mode) {
      case 'result':
        session.textInputFocused = true;
        return;

      case 'graph':
        switch (e.key) {
          case 'Escape':
            e.preventDefault();
            session.textInputFocused = true;
            return;
          case 'Enter':
          case '|':
            e.preventDefault();
            session.textInputFocused = true;
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
            session.textInputFocused = true;
            console.log('handleKeyPress', session.expression);
            session.expression = session.expression + e.key;
            console.log('handleKeyPress', session.expression);
            return;
        }
    }
  };

  const handleExpressionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    console.log('handleExpressionChange', e.target.value);
    session.expression = e.target.value;
  };

  return (
    <TextField
      id="input"
      label="Pine expression... "
      value={session.expression}
      size="small"
      variant="outlined"
      focused={session.textInputFocused}
      onFocus={() => {
        session.textInputFocused = true;
      }}
      multiline
      fullWidth
      minRows="8"
      maxRows="8"
      inputRef={inputRef}
      onChange={handleExpressionChange}
      onKeyDown={handleKeyPress}
      InputProps={{
        style: {
          fontFamily: 'monospace',
          fontSize: '0.875rem', // 14px
        },
      }}
    />
  );
});

export default TextInput;
