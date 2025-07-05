import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import React, { useRef, useEffect, useCallback } from 'react';
import { Session } from '../store/session';
import { prettifyExpression } from '../store/util';
import { observer } from 'mobx-react-lite';
import { pineLanguage } from './pine-language';
import { vim } from '@replit/codemirror-vim';
import { Button, Box } from '@mui/material';
import { PlayArrow, Loop } from '@mui/icons-material';

interface TextInputProps {
  session: Session;
}

const RunButton: React.FC<{ session: Session }> = observer(({ session }) => (
  <Button
    variant="contained"
    onClick={() => session.evaluate()}
    disabled={!session.expression || session.loading}
    startIcon={session.loading ? <Loop /> : <PlayArrow />}
    size="small"
    sx={{
      backgroundColor: 'var(--primary-color)',
      color: 'var(--primary-text-color)',
      '&:hover': {
        backgroundColor: 'var(--primary-color-hover)',
      },
      '&:disabled': {
        backgroundColor: 'var(--icon-color)',
        color: 'var(--text-color)',
        opacity: 0.6,
      },
      minWidth: 'auto',
      px: 1.5,
      py: 0.5,
    }}
  >
    Run
  </Button>
));

const TextInput: React.FC<TextInputProps> = observer(({ session }) => {
  const inputRef = useRef<ReactCodeMirrorRef | null>(null);
  const lastValueRef = useRef<string>(session.expression);

  /**
   * Optimized value update function that uses CodeMirror's transaction API
   * for better performance when updating the entire content
   */
  const updateEditorValue = useCallback((newValue: string) => {
    const editor = inputRef.current?.view;
    if (!editor) return;

    const currentValue = editor.state.doc.toString();
    if (currentValue === newValue) return;

    // Use a single transaction to replace the entire content
    // This is more efficient than letting the wrapper component handle it
    const transaction = editor.state.update({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: newValue
      },
      // Preserve cursor position at the end for prettification
      selection: { anchor: newValue.length }
    });

    editor.dispatch(transaction);
    lastValueRef.current = newValue;
  }, []);

  // Handle expression changes with optimized updates
  useEffect(() => {
    if (session.expression !== lastValueRef.current) {
      updateEditorValue(session.expression);
    }
  }, [session.expression, updateEditorValue]);

  /**
   * Global event handler for Ctrl+A - only prevent when not in Pine text input
   */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;

      // Allow Ctrl+A in any regular text input (including modals)
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true')) {
        return;
      }

      // Only prevent Ctrl+A when we're in session mode but not focused on the Pine input
      if (session.textInputFocused) {
        return;
      }

      // Disable Ctrl+A for general page selection
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', fn);
    return () => {
      document.removeEventListener('keydown', fn);
    };
  }, [session]);

  useEffect(() => {
    if (session.textInputFocused) {
      inputRef.current?.view?.focus();
    }
  }, [session.textInputFocused]);

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
      inputRef.current.view?.focus();
    };

    window.addEventListener('keydown', handleEscapeKey);
    return () => {
      window.removeEventListener('keydown', handleEscapeKey);
    };
  }, [session.mode]);

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

    // Handle Ctrl+Shift+F / Cmd+Shift+F for prettification (standard formatting shortcut)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      
      // Prettify the expression using the standard formatting shortcut
      const prettifiedExpression = prettifyExpression(session.expression);
      updateEditorValue(prettifiedExpression);
      
      // Update session state after DOM update
      session.expression = prettifiedExpression;
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
          session.blurTextInput();
          session.selectNextCandidate(1);
          return;
        case 'Enter':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            await session.evaluate();
            return;
          }
          break;
      }

      session.mode = 'graph';
      return;
    }

    switch (session.mode) {
      case 'result':
        session.focusTextInput();
        return;

      case 'graph':
        switch (e.key) {
          case 'Escape':
            e.preventDefault();
            session.focusTextInput();
            return;
          case 'Enter':
          case '|':
            e.preventDefault();
            session.focusTextInput();
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
            session.focusTextInput();
            session.expression = session.expression + e.key;
            return;
        }
    }
  };

  // Optimized onChange handler to prevent unnecessary updates
  const handleChange = useCallback((value: string) => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
      session.expression = value;
    }
  }, [session]);

  // Create extensions array with Pine language support and custom keymap
  const extensions = [
    pineLanguage,
    Prec.high(keymap.of([
      {
        key: 'Ctrl-Enter',
        run: () => {
          // Trigger evaluation with Ctrl+Enter
          session.evaluate();
          return true;
        }
      }
    ]))
  ];

  if (session.vimMode) {
    extensions.unshift(vim());
  }

  return (
    <Box sx={{ position: 'relative' }}>
      <div 
        tabIndex={1} 
        style={{ outline: 'none' }}
        onFocus={() => {
          // Delegate focus to the CodeMirror editor
          if (inputRef.current?.view) {
            inputRef.current.view.focus();
          }
        }}
      >
        <CodeMirror
          ref={inputRef}
          id="input"
          value={session.expression}
          height="177px"
          theme={oneDark}
          extensions={extensions}
          onFocus={() => {
            session.focusTextInput();
          }}
          onBlur={() => {
            session.blurTextInput();
          }}
          onChange={handleChange}
          onKeyDown={handleKeyPress}
          indentWithTab={false}
          basicSetup={{
            tabSize: 2,
            foldGutter: false,
            dropCursor: false,
            allowMultipleSelections: false,
            crosshairCursor: false,
          }}
          style={{ 
            outline: 'none',
          }}
          autoFocus={false}
          placeholder=""
        />
      </div>
      
      {/* Run button positioned at bottom right */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          zIndex: 10,
        }}
      >
        <RunButton session={session} />
      </Box>
    </Box>
  );
});

export default TextInput;
