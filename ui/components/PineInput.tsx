import {
  completionStatus,
  moveCompletionSelection,
  startCompletion,
} from '@codemirror/autocomplete';
import { Prec } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { vim } from '@replit/codemirror-vim';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Session } from '../store/session';
import { shouldShowTableColors } from '../store/table-colors.util';
import { useStores } from '../store/store-container';
import { prettifyExpression } from '../store/util';
import { createPineAutocompletion } from './pine-autocomplete';
import { pineLanguage } from './pine-language';
import { pineTableColorDecoration, astChangedEffect } from './pine-table-colors';

interface PineInputProps {
  session: Session;
}

const PineInput: React.FC<PineInputProps> = observer(({ session }) => {
  const { global } = useStores();
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
        insert: newValue,
      },
      // Preserve cursor position at the end for prettification
      selection: { anchor: newValue.length },
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

  useEffect(() => {
    if (session.textInputFocused) {
      inputRef.current?.view?.focus();
    }
  }, [session.textInputFocused]);

  const isPrintableChar = (key: string) => {
    return key.length === 1 && !key.match(/[\u0000-\u001F\u007F-\u009F]/);
  };

  const isModifierKeyCombo = (e: React.KeyboardEvent) => {
    return e.ctrlKey || e.metaKey || e.altKey || e.key === 'Meta';
  };

  // Optimized onChange handler to prevent unnecessary updates
  const handleChange = useCallback(
    (value: string) => {
      if (value !== lastValueRef.current) {
        lastValueRef.current = value;
        session.expression = value;
      }
    },
    [session],
  );

  // Debounced prettify function for pipe character
  const debouncedPrettifyOnPipe = useMemo(() => {
    let timeoutId: NodeJS.Timeout;

    return (view: EditorView, expectedContent: string) => {
      clearTimeout(timeoutId);

      timeoutId = setTimeout(() => {
        const currentContent = view.state.doc.toString();

        // If expectedContent was provided, check if the content has changed unexpectedly
        if (expectedContent && currentContent !== expectedContent) {
          // Content has changed since the autocomplete was applied, skip prettify
          return;
        }

        const prettifiedContent = prettifyExpression(currentContent, true);

        if (prettifiedContent === currentContent) {
          return;
        }

        // Update the session and editor with the prettified content
        session.expression = prettifiedContent;
        lastValueRef.current = prettifiedContent;

        // Update the editor directly to avoid the useEffect cycle
        const newTransaction = view.state.update({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: prettifiedContent,
          },
          selection: { anchor: prettifiedContent.length },
        });
        view.dispatch(newTransaction);
      }, 150); // 150ms debounce delay
    };
  }, [session]);

  const onHighlight = useCallback(
    (completion: any) => {
      if (!completion?.expression) {
        session.graph.candidate = null;
        return;
      }
      session.graph.candidate = { pine: completion.expression };
    },
    [session.graph], // Only depend on graph, not entire session
  );

  const onPipe = useCallback(
    (view: EditorView) => {
      const expectedContent = view.state.doc.toString();
      debouncedPrettifyOnPipe(view, expectedContent);
    },
    [debouncedPrettifyOnPipe],
  );

  // Create autocompletion extension that updates with hints
  const autocompletionExtension = useMemo(() => {
    return createPineAutocompletion(
      {
        hints: session.ast?.hints || null,
      },
      {
        onHighlight,
        onPipe,
      },
    );
  }, [session.ast?.hints, onHighlight, onPipe]);

  // Create cursor tracking extension
  const cursorUpdateExtension = useMemo(() => {
    return EditorView.updateListener.of(update => {
      const pos = update.state.selection.main.head;
      const line = update.state.doc.lineAt(pos);
      session.updateCursorPosition(
        line.number - 1, // Convert to 0-indexed
        pos - line.from,
      );
    });
  }, [session]);

  // Only color segments when we should show table colors (pref + rows + in-sync)
  const astForColors = shouldShowTableColors(global.pineTableColorsEnabled, session)
    ? session.ast
    : null;

  // Recompute table-color decorations when ast changes (e.g. after Run)
  useEffect(() => {
    const view = inputRef.current?.view;
    if (view && astForColors) {
      view.dispatch({ effects: astChangedEffect.of(undefined) });
    }
  }, [astForColors]);

  // Create extensions array with Pine language support and custom keymap
  const extensions = [
    pineLanguage,
    autocompletionExtension,
    cursorUpdateExtension,
    ...pineTableColorDecoration(astForColors, global.theme === 'dark'),
    // Browser shortcuts - highest precedence to ensure they always work
    Prec.highest(
      keymap.of([
        {
          key: 'Mod-r', // Ctrl+R (Windows/Linux) or Cmd+R (Mac)
          run: () => false, // Let browser handle reload
        },
        {
          key: 'Mod-t', // Ctrl+T (Windows/Linux) or Cmd+T (Mac)
          run: () => false, // Let browser handle new tab
        },
        {
          key: 'Mod-w', // Ctrl+W (Windows/Linux) or Cmd+W (Mac)
          run: () => false, // Let browser handle close tab
        },
        {
          key: 'F5',
          run: () => false, // Let browser handle F5 (reload)
        },
      ]),
    ),
    Prec.high(
      keymap.of([
        {
          key: 'Mod-Enter',
          run: () => {
            // Trigger evaluation with Cmd/Ctrl+Enter
            session.evaluate();
            return true;
          },
        },
        {
          key: 'Mod-Space',
          run: view => {
            // Trigger autocompletion with Cmd/Ctrl+Space
            session.requestHints(); // Trigger rebuild
            return startCompletion(view);
          },
        },
        {
          key: 'Tab',
          run: view => {
            const status = completionStatus(view.state);
            if (status === 'active') {
              return moveCompletionSelection(true)(view);
            } else {
              session.requestHints(); // Trigger rebuild
              return startCompletion(view);
            }
          },
        },
        {
          key: 'Shift-Tab',
          run: view => {
            // Check if autocompletion is currently active
            const status = completionStatus(view.state);

            if (status === 'active') {
              // If suggestions are showing, move to the previous suggestion
              return moveCompletionSelection(false)(view);
            } else {
              // If no suggestions are showing, let default behavior handle it
              return false;
            }
          },
        },
        {
          key: '|',
          run: view => {
            // Get current cursor position and document
            const pos = view.state.selection.main.head;
            const doc = view.state.doc;

            // If not at end, let the default behavior handle it
            if (pos !== doc.length) {
              return false;
            }

            // Insert the pipe character first
            view.dispatch({
              changes: { from: pos, to: pos, insert: '|' },
              selection: { anchor: pos + 1 },
            });

            // Call prettify with the current editor content to avoid race conditions
            debouncedPrettifyOnPipe(view, view.state.doc.toString());

            return true;
          },
        },
      ]),
    ),
  ];

  if (session.vimMode) {
    // Add vim mode with high precedence, but lower than browser shortcuts
    extensions.push(Prec.high(vim()));
  }

  return (
    <CodeMirror
      ref={inputRef}
      id="input"
      value={session.expression}
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
      }}
      style={{
        outline: 'none',
      }}
      autoFocus={true}
      placeholder=""
    />
  );
});

export default PineInput;
