import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import {
  autocompletion,
  completionStatus,
  moveCompletionSelection,
  startCompletion,
} from '@codemirror/autocomplete';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { sql } from '@codemirror/lang-sql';
import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { Session } from '../store/session';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import { vim } from '@replit/codemirror-vim';
import { Box } from '@mui/material';
import { useStores } from '../store/store-container';
import { editorChrome, editorDarkSyntax } from './editor-theme';
import { sqlCompletionConfig } from '../utils/sqlCompletion';
import { sqlConversionLines } from '../utils/sqlConversionStatus';
import { sqlJoinSource } from '../utils/sqlJoinCompletion';

interface SqlInputProps {
  session: Session;
  /** See PineInput's own doc comment on this same prop - New Layout's
   * optional panel passes false so opening it doesn't steal keyboard focus
   * away from the canvas. */
  autoFocus?: boolean;
}

const SqlInput: React.FC<SqlInputProps> = observer(({ session, autoFocus = true }) => {
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

  // Covers the same race as PineInput.tsx's own onCreateEditor comment:
  // when focus is requested (session.focusTextInput()) in the same tick
  // this editor mounts -- GlobalStore.toggleSqlPanel opening New Layout's
  // panel -- the effect above already ran and found no view to focus yet.
  // Fire once more the moment the view actually exists.
  const onCreateEditor = useCallback(
    (view: EditorView) => {
      if (session.textInputFocused) {
        view.focus();
      }
    },
    [session],
  );

  const handleChange = useCallback(
    (value: string) => {
      if (value !== session.query) {
        runInAction(() => {
          session.query = value;
        });
        lastValueRef.current = value;
        // Only a typed edit converts, never a write from the session (the
        // SQL built from the Pine), which arrives with value === query.
        session.sqlEdited();
      }
    },
    [session],
  );

  const isDark = global.theme === 'dark';
  const vimMode = global.vimMode;

  // Table and column names to complete, loaded again when the connection
  // changes or is reindexed.
  const connectionId = session.connectionId;
  const schemaVersion = global.schemaVersion;
  useEffect(() => {
    void session.loadSqlSchema();
  }, [session, connectionId, schemaVersion]);
  const sqlSchema = session.sqlSchema;
  const sqlConfig = useMemo(() => sqlCompletionConfig(sqlSchema), [sqlSchema]);
  // SQL with the schema's names, and after JOIN, the joins Pine knows.
  const sqlLanguage = useMemo(() => {
    const language = sql(sqlConfig);
    const joins = sqlJoinSource((query, cursor) => session.sqlJoinHints(query, cursor));
    return [language, language.language.data.of({ autocomplete: joins })];
  }, [sqlConfig, session]);

  const selectionUpdateExtension = useMemo(() => {
    return EditorView.updateListener.of(update => {
      const { main } = update.state.selection;
      const text = main.empty ? '' : update.state.sliceDoc(main.from, main.to);
      session.setQuerySelection(text);
    });
  }, [session]);

  // Memoized: a new array reconfigures the whole editor, and this component
  // renders on every build. With a large schema that was felt per keystroke.
  const extensions = useMemo(() => {
    const extensions = [
      EditorView.lineWrapping,
      sqlLanguage,
      // Hints open on request, as in the Pine panel (pine-autocomplete.ts):
      // Tab or Ctrl/Cmd-Space, never while typing.
      autocompletion({ activateOnTyping: false, closeOnBlur: true, selectOnOpen: true }),
      editorChrome(isDark),
      ...(isDark ? [editorDarkSyntax] : []),
      selectionUpdateExtension,
      // Structural only (height/padding) - color and font-family now come
      // entirely from editorChrome, shared with PineInput.tsx.
      EditorView.theme({
        '&': {
          fontSize: '13px',
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
          // The Pine panel's keys (PineInput.tsx): Tab opens the hints, then
          // moves to the next one; Shift-Tab moves back.
          {
            key: 'Tab',
            run: view =>
              completionStatus(view.state) === 'active'
                ? moveCompletionSelection(true)(view)
                : startCompletion(view),
          },
          {
            key: 'Shift-Tab',
            run: view =>
              completionStatus(view.state) === 'active' && moveCompletionSelection(false)(view),
          },
          { key: 'Mod-Space', run: startCompletion },
        ]),
      ),
    ];

    if (vimMode) {
      extensions.push(Prec.high(vim()));
    }

    // Escape stops a running query, as in the Pine editor (PineInput.tsx).
    extensions.push(
      Prec.lowest(
        keymap.of([
          {
            key: 'Escape',
            run: () => {
              if (!session.loading || !session.runId) return false;
              session.stop();
              return true;
            },
          },
        ]),
      ),
    );
    return extensions;
  }, [isDark, vimMode, sqlLanguage, selectionUpdateExtension, session]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <CodeMirror
          ref={inputRef}
          id="sql-input"
          value={session.query}
          height="100%"
          theme="none"
          extensions={extensions}
          onCreateEditor={onCreateEditor}
          onFocus={() => {
            session.focusTextInput();
          }}
          onBlur={() => {
            session.blurTextInput();
          }}
          onChange={handleChange}
          indentWithTab={false}
          basicSetup={{
            // Configured in extensions, so hints don't open while typing.
            autocompletion: false,
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
          autoFocus={autoFocus}
          placeholder="Enter your SQL query here..."
        />
      </Box>
      <SqlConversionStatus session={session} />
    </Box>
  );
});

/**
 * Under the SQL editor: whether its text converted to Pine, the canvas's
 * source. Nothing while the editor hasn't been typed in.
 */
const SqlConversionStatus: React.FC<{ session: Session }> = observer(({ session }) => {
  const { status, message } = session.sqlConversion;
  const lines = status === 'idle' ? [] : sqlConversionLines(session.sqlConversion);
  // Rendered empty rather than unmounted: a screen reader announces changes
  // to a status region that is already there.
  return (
    <Box
      role="status"
      sx={{
        flexShrink: 0,
        pl: 1.5,
        // Clears the Run button, which floats over the panel's bottom-right
        // corner (Input.tsx), so a long message wraps before it instead of
        // running underneath.
        pr: '112px',
        py: lines.length ? 0.5 : 0,
        borderTop: lines.length ? '1px solid var(--divider-color)' : 'none',
        fontFamily: 'var(--canvas-font)',
        fontSize: '12px',
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        // Not the warning colour: it is red in every theme, and red is for
        // a query that can't run (the band above the results). This SQL can.
        // The amber the canvas uses for what it can't resolve marks the line
        // instead, as a bar: as text it is too faint for 12px in the light
        // themes.
        color: message ? 'var(--text-color)' : 'var(--node-secondary-text-color)',
        borderLeft: message ? '2px solid var(--canvas-trace-unresolved)' : 'none',
      }}
    >
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </Box>
  );
});

export default SqlInput;
