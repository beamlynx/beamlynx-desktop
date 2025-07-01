import React, { useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import { Box, Typography } from '@mui/material';
import { EditorView, basicSetup } from 'codemirror';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState } from '@codemirror/state';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { useEffect, useState } from 'react';

interface QueryProps {
  sessionId: string;
}

const Query: React.FC<QueryProps> = observer(({ sessionId }) => {
  const { global: store } = useStores();
  const session = store.getSession(sessionId);
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorView, setEditorView] = useState<EditorView | null>(null);

  const onClick = () => {
    if (!session.query) {
      return;
    }
    const v = session.query;
    navigator.clipboard.writeText(v).then(() => {
      store.setCopiedMessage(sessionId, v);
    });
  };

  useEffect(() => {
    if (!editorRef.current || !session.query) return;

    // Clean up existing editor
    if (editorView) {
      editorView.destroy();
    }

    const extensions = [
      // Use minimal setup instead of basicSetup to avoid unwanted features
      EditorView.lineWrapping,
      sql(),
      EditorView.theme({
        '&': {
          fontSize: '12px',
          fontFamily: 'monospace',
        },
        '.cm-editor': {
          cursor: 'pointer',
        },
        '.cm-focused': {
          outline: 'none',
        },
        '.cm-content': {
          padding: '8px 12px',
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

    if (session.theme === 'dark') {
      extensions.push(oneDark);
    }

    const state = EditorState.create({
      doc: session.query,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    setEditorView(view);

    return () => {
      view.destroy();
    };
  }, [session.query, session.theme, onClick]);

  if (session.error && session.errorType === 'parse') {
    return (
      <Box sx={{ margin: 1 }}>
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'monospace',
            whiteSpace: 'break-spaces',
            lineHeight: 1,
            color: 'red',
          }}
        >
          {session.error}
        </Typography>
      </Box>
    );
  }

      if (session.query) {
      return (
        <div ref={editorRef} />
      );
    }

      return (
      <div
        style={{
          padding: '8px 12px',
          fontSize: '12px',
          fontFamily: 'monospace',
          color: 'gray',
        }}
      >
        SQL shows here for a valid pine expression.
      </div>
    );
});

export default Query;
