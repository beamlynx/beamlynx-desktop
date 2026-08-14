import {
  completionStatus,
  moveCompletionSelection,
  startCompletion,
} from '@codemirror/autocomplete';
import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { vim } from '@replit/codemirror-vim';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Session } from '../store/session';
import { shouldShowTableColors } from '../store/table-colors.util';
import { useStores } from '../store/store-container';
import { editorChrome, editorDarkSyntax } from './editor-theme';
import { createPineAutocompletion } from './pine-autocomplete';
import { pineLanguage } from './pine-language';
import { tableColorDecoration } from './table-colors';

interface PineInputProps {
  session: Session;
}

const PineInput: React.FC<PineInputProps> = observer(({ session }) => {
  const { global } = useStores();
  const inputRef = useRef<ReactCodeMirrorRef | null>(null);
  const lastValueRef = useRef<string>(session.expression);
  // Frozen at mount, never updated: @uiw/react-codemirror's own internal
  // effect (useCodeMirror.ts) treats `value` as a controlled prop and
  // re-syncs the doc whenever it changes, but does so with no explicit
  // selection -- collapsing the cursor to position 0 on every programmatic
  // expression change (URL-param injection, clicking a graph node, etc.).
  // Worse, since <CodeMirror> is a child of this component, its effect runs
  // first, so by the time updateEditorValue's own effect below runs (which
  // *does* set the cursor correctly, to the end), the doc already matches
  // and its early-exit guard skips re-applying the fix. `value` is only
  // read by that library effect and by the initial EditorState.create call
  // on mount -- passing a value that never changes after mount permanently
  // disables the competing effect, leaving updateEditorValue as the sole
  // authority for programmatic updates.
  const initialValueRef = useRef<string>(session.expression);

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

  // Cycle through candidate relations -- advances the CodeMirror completion
  // dropdown's selection if it's already open, otherwise opens it. This is
  // what Tab runs when the input itself is focused (see the keymap below);
  // pulled out so the graph can trigger the exact same behavior (see the
  // tabCycleRequestCount effect below) instead of duplicating it.
  const cycleCompletion = useCallback(
    (view: EditorView): boolean => {
      const status = completionStatus(view.state);
      if (status === 'active') {
        return moveCompletionSelection(true)(view);
      } else {
        session.requestHints(); // Trigger rebuild
        return startCompletion(view);
      }
    },
    [session],
  );

  // Tab pressed while the graph (not this input) has focus -- session
  // bumps tabCycleRequestCount (see components/Graph.box.tsx), and this
  // brings focus back here and runs the same candidate-cycling Tab already
  // does, so Tab means the same thing everywhere instead of falling through
  // to React Flow's own node/edge tab navigation.
  const prevTabCycleRequestRef = useRef(session.tabCycleRequestCount);
  useEffect(() => {
    if (session.tabCycleRequestCount === prevTabCycleRequestRef.current) return;
    prevTabCycleRequestRef.current = session.tabCycleRequestCount;
    const view = inputRef.current?.view;
    if (view) {
      view.focus();
      cycleCompletion(view);
    }
  }, [session.tabCycleRequestCount, cycleCompletion]);

  // Optimized onChange handler to prevent unnecessary updates
  const handleChange = useCallback(
    (value: string) => {
      if (value !== lastValueRef.current) {
        lastValueRef.current = value;
        runInAction(() => {
          session.expression = value;
        });
      }
    },
    [session],
  );

  // Debounced prettify function for pipe character
  const debouncedPrettifyOnPipe = useMemo(() => {
    let timeoutId: NodeJS.Timeout;

    return (view: EditorView, expectedContent: string) => {
      clearTimeout(timeoutId);

      timeoutId = setTimeout(async () => {
        const currentContent = view.state.doc.toString();

        // If expectedContent was provided, check if the content has changed unexpectedly
        if (expectedContent && currentContent !== expectedContent) {
          // Content has changed since the autocomplete was applied, skip prettify
          return;
        }

        const prettifiedContent = await session.prettifyExpression(currentContent, false);

        if (prettifiedContent === currentContent) {
          return;
        }

        // Update the session and editor with the prettified content
        runInAction(() => {
          session.expression = prettifiedContent;
        });
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
      runInAction(() => {
        session.graph.candidate = completion?.expression ? { pine: completion.expression } : null;
      });
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
        isLoading: () => session.hintsLoading,
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
  const showColors = shouldShowTableColors(global.pineTableColorsEnabled, session);
  const colorAst = showColors ? session.ast : null;
  const isDark = global.theme === 'dark';

  // tableColorDecoration builds a brand-new CodeMirror StateField every call, so it must
  // only be recreated when the underlying ast/theme actually changes, not on every render.
  const tableColorExtension = useMemo(
    () => tableColorDecoration(colorAst, isDark),
    [colorAst, isDark],
  );

  // Create extensions array with Pine language support and custom keymap
  //
  // Memoized: react-codemirror reconfigures (tears down and rebuilds) the entire editor
  // — decorations, autocompletion, keymaps, cursor tracking — whenever this array's
  // *reference* changes (see its internal useEffect keyed on the extensions prop). Without
  // memoization this array was rebuilt fresh on every render of this observer component,
  // i.e. on every keystroke, forcing a full reconfigure each time. That cost scales with
  // document size, which is why it got worse with more expression blocks.
  const extensions = useMemo(() => {
    const exts = [
      pineLanguage,
      editorChrome(isDark),
      ...(isDark ? [editorDarkSyntax] : []),
      autocompletionExtension,
      cursorUpdateExtension,
      ...tableColorExtension,
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
            run: cycleCompletion,
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
      exts.push(Prec.high(vim()));
    }

    return exts;
    // session.vimMode is listed deliberately, not redundantly: session itself is a stable
    // reference for this component's lifetime (each tab is keyed by sessionId), so depending
    // on session alone would never re-run this memo when vim mode is toggled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isDark,
    autocompletionExtension,
    cursorUpdateExtension,
    tableColorExtension,
    session,
    session.vimMode,
    debouncedPrettifyOnPipe,
    cycleCompletion,
  ]);

  // A fresh EditorState (created from initialValueRef.current, see below)
  // defaults its selection to position 0 unless one is explicitly given --
  // and by the time this component first mounts, session.expression may
  // already hold a non-empty value injected before mount (e.g. the `query`
  // URL param, handled in GlobalStore.handleUrlParameters, runs before this
  // tab's editor exists), so there's never a subsequent "expression changed"
  // moment for updateEditorValue's effect above to correct the cursor on.
  // Set it explicitly, once, right after creation.
  const onCreateEditor = useCallback((view: EditorView) => {
    view.dispatch({ selection: { anchor: initialValueRef.current.length } });
  }, []);

  return (
    <CodeMirror
      ref={inputRef}
      id="input"
      value={initialValueRef.current}
      height="100%"
      // Chrome (background/gutters/selection/cursor) comes entirely from
      // `editorChrome` in the extensions array now, not a borrowed
      // third-party theme - `theme="none"` skips @uiw/react-codemirror's own
      // built-in 'light'/oneDark bundles instead of layering under them.
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
