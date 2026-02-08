import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { sql } from '@codemirror/lang-sql';
import React, { useRef, useEffect, useCallback } from 'react';
import { Session } from '../store/session';
import { observer } from 'mobx-react-lite';
import { vim } from '@replit/codemirror-vim';
import { Box } from '@mui/material';
import { useStores } from '../store/store-container';

interface SqlInputProps {
  session: Session;
}

const SqlInput: React.FC<SqlInputProps> = observer(({ session }) => {
  const { global } = useStores();
  const inputRef = useRef<ReactCodeMirrorRef | null>(null);
  const lastValueRef = useRef<string>(session.query);

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
    const transaction = editor.state.update({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: newValue,
      },
      // Preserve cursor position at the end
      selection: { anchor: newValue.length },
    });

    editor.dispatch(transaction);
    lastValueRef.current = newValue;
  }, []);

  // Handle query changes with optimized updates
  useEffect(() => {
    if (session.query !== lastValueRef.current) {
      updateEditorValue(session.query);
    }
  }, [session.query, updateEditorValue]);

  useEffect(() => {
    if (session.textInputFocused) {
      inputRef.current?.view?.focus();
    }
  }, [session.textInputFocused]);

  const handleChange = useCallback(
    (value: string) => {
      if (value !== session.query) {
        session.query = value;
        lastValueRef.current = value;
      }
    },
    [session],
  );

  const extensions = [
    EditorView.lineWrapping,
    sql(),
    EditorView.theme({
      '&': {
        fontSize: '12px',
        fontFamily: 'monospace',
        height: '100%',
      },
      '.cm-editor': {
        height: '100%',
      },
      '.cm-focused': {
        outline: 'none',
      },
      '.cm-content': {
        padding: '8px 12px',
        minHeight: '100%',
      },
      '.cm-scroller': {
        fontFamily: 'monospace',
        height: '100%',
      },
    }),
    Prec.high(
      keymap.of([
        {
          key: 'Mod-Enter',
          run: () => {
            session.evaluate();
            return true;
          },
        },
      ]),
    ),
  ];

  if (session.vimMode) {
    extensions.push(Prec.high(vim()));
  }

  return (
    <CodeMirror
      ref={inputRef}
      id="sql-input"
      value={session.query}
      height="100%"
      theme={global.theme === 'dark' ? oneDark : 'light'}
      extensions={extensions}
      onFocus={() => {
        session.focusTextInput();
      }}
      onBlur={() => {
        session.blurTextInput();
      }}
      onChange={handleChange}
      indentWithTab={false}
      basicSetup={{
        tabSize: 2,
        foldGutter: false,
        dropCursor: false,
        allowMultipleSelections: false,
        crosshairCursor: false,
        lineNumbers: true,
      }}
      style={{
        outline: 'none',
      }}
      autoFocus={true}
      placeholder="Enter your SQL query here..."
    />
  );
});

export default SqlInput;
