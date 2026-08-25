import { sql } from '@codemirror/lang-sql';
import { EditorState } from '@codemirror/state';
import { Box, Typography } from '@mui/material';
import { EditorView } from 'codemirror';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStores } from '../store/store-container';
import { editorChrome, editorDarkSyntax } from './editor-theme';

interface QueryProps {
  sessionId: string;
}

const Query: React.FC<QueryProps> = observer(({ sessionId }) => {
  const { global: store } = useStores();
  const session = store.getSession(sessionId);
  const editorRef = useRef<HTMLDivElement>(null);

  const onClick = useCallback(() => {
    if (!session.query) {
      return;
    }
    const v = session.getSqlClipboardText();
    navigator.clipboard.writeText(v).then(() => {
      store.setCopiedMessage(sessionId, v);
    });
    // session.expression is deliberately not a dependency: getSqlClipboardText()
    // reads it fresh from the live session at call time, so listing it here only
    // sees a mobx-tracked read that changes on every keystroke in the Pine input.
    // That gave this callback a new identity every keystroke, which retriggered
    // the effect below and rebuilt the entire read-only SQL CodeMirror view each
    // time - the actual source of the "typing feels laggy" symptom.
  }, [session.query, store, sessionId]);

  useEffect(() => {
    if (!editorRef.current || !session.query) return;

    const extensions = [
      EditorView.lineWrapping,
      sql(),
      editorChrome(store.theme === 'dark'),
      ...(store.theme === 'dark' ? [editorDarkSyntax] : []),
      // Structural overrides on top of editorChrome - this view is read-only
      // (no cursor/selection/active-line to show) and click-to-copy, not
      // click-to-edit.
      EditorView.theme({
        '&': {
          fontSize: 'calc(12px * var(--text-scale, 1))',
          height: '100%',
        },
        '.cm-editor': {
          cursor: 'pointer',
          height: '100%',
        },
        '.cm-focused': {
          outline: 'none',
        },
        '.cm-content': {
          padding: '8px 12px',
          minHeight: '100%',
        },
        '.cm-editor.cm-focused .cm-selectionBackground': {
          backgroundColor: 'transparent',
        },
        '.cm-activeLine': {
          backgroundColor: 'transparent',
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'transparent',
        },
        '.cm-gutters': {
          display: 'none',
        },
      }),
      EditorView.editable.of(false),
      EditorView.domEventHandlers({
        click: onClick,
      }),
    ];

    const state = EditorState.create({
      doc: session.query,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    return () => {
      view.destroy();
    };
  }, [session.query, store.theme, onClick]);

  if (session.inputMode === 'sql') {
    return (<div
      style={{
        padding: '8px 12px',
        fontSize: 'calc(12px * var(--text-scale, 1))',
        fontFamily: 'var(--canvas-font)',
        color: 'var(--canvas-text-dim)',
      }}
    >
      SQL mode enabled. You can edit the SQL query directly in the input.
    </div>);
  }

  if (session.query) {
    return (
      <Box
        ref={editorRef}
        sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      />
    );
  }

  return (
    <div
      style={{
        padding: '8px 12px',
        fontSize: 'calc(12px * var(--text-scale, 1))',
        fontFamily: 'var(--canvas-font)',
        color: 'var(--canvas-text-dim)',
      }}
    >
      SQL shows here for a valid pine expression.
    </div>
  );
});

export default Query;
