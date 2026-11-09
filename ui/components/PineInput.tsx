import {
  completionStatus,
  moveCompletionSelection,
  startCompletion,
} from '@codemirror/autocomplete';
import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { observer } from 'mobx-react-lite';
import { comparer, reaction, runInAction } from 'mobx';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Session } from '../store/session';
import { useStores } from '../store/store-container';
import { editorChrome, editorDarkSyntax } from './editor-theme';
import { panelPeekTarget } from '../store/canvas/json-peek';
import { createPineAutocompletion, refreshCompletions } from './pine-autocomplete';
import { pineLanguage } from './pine-language';
import { setTableColors, tableColors } from './table-colors';
import { useVimExtension } from './vim-mode';
import { cursorAfterReformat, isAtEndOfBlock, pastSpaceAfterPipe, sameApartFromWhitespace } from '../utils/cursor';

interface PineInputProps {
  session: Session;
  /** Most callers (e.g. UpdateModal.tsx) want this focused the moment it
   * mounts - it's their primary, only-once-mounted entry point. New
   * Layout's optional Pine/SQL panel is the exception: it remounts this
   * every time it's opened, and autofocusing there would steal keyboard
   * focus away from the canvas on every open, blocking every canvas
   * keybinding until the user clicked back into it. Defaults to true;
   * NewLayoutView passes false. */
  autoFocus?: boolean;
}

// Module constants, not literals in the JSX: @uiw/react-codemirror
// reconfigures the whole editor whenever `basicSetup` is a new object (it is
// in the dependency list of its reconfigure effect), and this component
// renders on every keystroke and every build.
const basicSetup = {
  tabSize: 2,
  foldGutter: false,
  dropCursor: false,
  allowMultipleSelections: false,
  crosshairCursor: false,
};
const editorStyle = { outline: 'none' };

const PineInput: React.FC<PineInputProps> = observer(({ session, autoFocus = true }) => {
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
    // A recipe was just put into this tab (see Session.pendingSelection):
    // select its first value, after the replace above moved the cursor to
    // the end. In Vim mode a selection would start visual mode, so the cursor
    // goes to the start of the value instead.
    const pending = session.pendingSelection;
    const view = inputRef.current?.view;
    if (pending && view) {
      const max = view.state.doc.length;
      const anchor = Math.min(pending.anchor, max);
      const head = global.vimMode ? anchor : Math.min(pending.head, max);
      view.dispatch({ selection: { anchor, head }, scrollIntoView: true });
      if (pending.focus !== false) view.focus();
      runInAction(() => {
        session.pendingSelection = null;
      });
    }
  }, [session.expression, session.pendingSelection, updateEditorValue, session, global]);

  useEffect(() => {
    if (session.textInputFocused) {
      inputRef.current?.view?.focus();
    }
  }, [session.textInputFocused]);

  // Tab or Ctrl/Cmd+Space after a key inside a JSON column, `s: content.`,
  // peeks at the column's first value in the results pane (Session.peekAt).
  // The peek follows the cursor until it leaves the key, Escape, or the
  // focus leaves the editor for anything but the peek itself.
  const peekingRef = useRef(false);
  const startPeek = useCallback(
    (view: EditorView) => {
      peekingRef.current = true;
      void session.peekAt(view.state.doc.toString(), view.state.selection.main.head);
    },
    [session],
  );
  const stopPeek = useCallback(() => {
    if (!peekingRef.current) return false;
    peekingRef.current = false;
    void session.peekAt('', null);
    return true;
  }, [session]);

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
        startPeek(view);
        return startCompletion(view);
      }
    },
    [session, startPeek],
  );

  // Tab pressed while the graph (not this input) has focus -- session
  // bumps tabCycleRequestCount (see components/canvas/Canvas.tsx), and this
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

        let prettifiedContent: string;
        try {
          prettifiedContent = await session.prettifyExpression(currentContent, false);
        } catch {
          return; // The server is away: the text stays as typed.
        }

        // Left alone: no change; text typed while the server answered, which
        // replacing would undo; and a tidy that dropped a comment.
        if (
          prettifiedContent === currentContent ||
          view.state.doc.toString() !== currentContent ||
          !sameApartFromWhitespace(currentContent, prettifiedContent)
        ) {
          return;
        }

        // Update the session and editor with the prettified content
        runInAction(() => {
          session.expression = prettifiedContent;
        });
        lastValueRef.current = prettifiedContent;

        // Update the editor directly to avoid the useEffect cycle. The
        // cursor stays where it was: a `|` typed near the top of a long
        // expression used to send it to the end.
        const cursor = pastSpaceAfterPipe(
          prettifiedContent,
          cursorAfterReformat(currentContent, prettifiedContent, view.state.selection.main.head),
        );
        const newTransaction = view.state.update({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: prettifiedContent,
          },
          selection: { anchor: cursor },
          scrollIntoView: true,
        });
        view.dispatch(newTransaction);
      }, 150); // 150ms debounce delay
    };
  }, [session]);

  const onHighlight = useCallback(
    (completion: any) => {
      runInAction(() => {
        session.candidate = completion?.expression ? { pine: completion.expression } : null;
      });
    },
    [session],
  );

  const onPipe = useCallback(
    (view: EditorView) => {
      // Picking a suggestion adds a `|`, and tidies like typing one.
      if (!global.autoTidy) return;
      const expectedContent = view.state.doc.toString();
      debouncedPrettifyOnPipe(view, expectedContent);
    },
    [debouncedPrettifyOnPipe, global],
  );

  // Made once per tab: it reads the hints when the list is queried. A new
  // completion source per build closed the open list, or reopened it empty.
  const autocompletionExtension = useMemo(() => {
    return createPineAutocompletion(
      {
        hints: () => session.ast?.hints || null,
        isLoading: () => session.hintsLoading,
      },
      {
        onHighlight,
        onPipe,
      },
    );
  }, [session, onHighlight, onPipe]);

  // A build that finishes while the list is open fills it with the new
  // hints, in place of "Loading..." or the last build's.
  useEffect(
    () =>
      reaction(
        () => [session.ast?.hints, session.hintsLoading] as const,
        ([, loading]) => {
          const view = inputRef.current?.view;
          if (view && !loading) refreshCompletions(view);
        },
        { equals: comparer.shallow },
      ),
    [session],
  );

  // Create cursor tracking extension
  const cursorUpdateExtension = useMemo(() => {
    return EditorView.updateListener.of(update => {
      const pos = update.state.selection.main.head;
      const line = update.state.doc.lineAt(pos);
      // Selected lines narrow Run to the blocks they touch.
      const { from, to, empty } = update.state.selection.main;
      session.setPineSelection(
        empty
          ? null
          : { from: update.state.doc.lineAt(from).number - 1, to: update.state.doc.lineAt(to).number - 1 },
      );
      session.updateCursorPosition(
        line.number - 1, // Convert to 0-indexed
        pos - line.from,
      );
      // A peek follows the cursor until it leaves the key (see startPeek).
      if (peekingRef.current && (update.docChanged || update.selectionSet)) {
        const text = update.state.doc.toString();
        if (panelPeekTarget(text, pos)) void session.peekAt(text, pos);
        else stopPeek();
      }
    });
  }, [session, stopPeek]);

  // Only color segments when we should show table colors (pref + rows + in-sync)
  const showColors = session.tableColorsShown;
  const colorAst = showColors ? session.ast : null;
  const isDark = global.theme === 'dark';

  // The colors change through an effect on the editor's one table-color
  // field, not a new extension, so a build doesn't reconfigure the editor.
  // onCreateEditor applies them to an editor created after this runs.
  const colorsRef = useRef({ ast: colorAst, isDark });
  colorsRef.current = { ast: colorAst, isDark };
  useEffect(() => {
    const view = inputRef.current?.view;
    if (view) setTableColors(view, colorAst, isDark);
  }, [colorAst, isDark]);

  const vimExtension = useVimExtension(global.vimMode);

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
      tableColors,
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
              // Cmd/Ctrl+Enter runs, the same as the Run button.
              session.run();
              return true;
            },
          },
          {
            key: 'Mod-Space',
            run: view => {
              // Trigger autocompletion with Cmd/Ctrl+Space
              session.requestHints(); // Trigger rebuild
              startPeek(view);
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
              // A `|` that ends its query tidies it, wherever the query is in
              // the editor. One in the middle of a query, say before another
              // step or in a string, is just typed: tidying would move text
              // that's still being written.
              const pos = view.state.selection.main.head;
              if (!global.autoTidy || !isAtEndOfBlock(view.state.doc.toString(), pos)) {
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

    if (vimExtension) {
      // Add vim mode with high precedence, but lower than browser shortcuts
      exts.push(Prec.high(vimExtension));
    }

    // Escape ends a peek and stops a running query. Lowest precedence, so
    // closing the completion list or leaving Vim's insert mode comes first.
    exts.push(
      Prec.lowest(
        keymap.of([
          {
            key: 'Escape',
            run: () => {
              const peeked = stopPeek();
              if (!session.loading || !session.runId) return peeked;
              session.stop();
              return true;
            },
          },
        ]),
      ),
    );

    return exts;
    // vimExtension is listed deliberately: session itself is a stable reference for this
    // component's lifetime (each tab is keyed by sessionId), so depending on session alone
    // would never re-run this memo when vim mode is toggled, or once Vim has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isDark,
    autocompletionExtension,
    cursorUpdateExtension,
    session,
    vimExtension,
    debouncedPrettifyOnPipe,
    cycleCompletion,
    startPeek,
    stopPeek,
  ]);

  // A fresh EditorState (created from initialValueRef.current, see below)
  // defaults its selection to position 0 unless one is explicitly given --
  // and by the time this component first mounts, session.expression may
  // already hold a non-empty value injected before mount (e.g. the `query`
  // URL param, handled in GlobalStore.handleUrlParameters, runs before this
  // tab's editor exists), so there's never a subsequent "expression changed"
  // moment for updateEditorValue's effect above to correct the cursor on.
  // Set it explicitly, once, right after creation.
  const onCreateEditor = useCallback(
    (view: EditorView) => {
      // The cursor starts where the session has it, so opening the panel
      // keeps the query block the canvas draws (CanvasStore.selectQuery may
      // have moved it while the panel was closed). Without one, at the end.
      const pending = session.pendingSelection;
      const cursor = session.cursorPosition;
      const doc = view.state.doc;
      let anchor = doc.length;
      if (pending) {
        anchor = Math.min(pending.anchor, doc.length);
        runInAction(() => {
          session.pendingSelection = null;
        });
      } else if (cursor && cursor.line < doc.lines) {
        const line = doc.line(cursor.line + 1);
        anchor = line.from + Math.min(cursor.character, line.length);
      }
      view.dispatch({ selection: { anchor } });
      setTableColors(view, colorsRef.current.ast, colorsRef.current.isDark);

      // If focus was already requested (session.focusTextInput()) before this
      // editor finished mounting -- e.g. GlobalStore.togglePinePanel firing
      // in the same tick that opens New Layout's panel -- the effect below
      // keyed on session.textInputFocused has already run and found
      // inputRef.current?.view undefined, since @uiw/react-codemirror
      // creates its EditorView a render or two after the initial mount (see
      // its useCodeMirror.ts: the view only exists once `container` state
      // has round-tripped through a render). That effect never fires again
      // on its own, because the boolean it watches doesn't change again --
      // so without this, the panel opens with the graph correctly
      // deprioritized (textInputFocused blocks its keybindings) but nothing
      // visibly focused to type into. Call .focus() here too, the moment
      // the view actually exists, to close that race.
      if (session.textInputFocused) {
        view.focus();
      }
    },
    [session],
  );

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
      onBlur={(e: React.FocusEvent) => {
        session.blurTextInput();
        const to = e.relatedTarget as HTMLElement | null;
        if (!to?.closest('[data-json-peek]')) stopPeek();
      }}
      onChange={handleChange}
      // Ctrl+O opens the Library to find a recipe. Caught on the editor's container,
      // before the editor sees the key: Vim reads Ctrl+O as "jump back" (normal
      // mode) or "run one normal command" (insert mode) and handles it ahead
      // of any keymap, and a key the editor handles never reaches the
      // document, where useGlobalKeybindings binds use-recipe for focus
      // outside the editor.
      onKeyDownCapture={(e: React.KeyboardEvent) => {
        if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'o') return;
        if (typeof window === 'undefined' || !window.beamlynxDesktop?.recipes) return;
        e.preventDefault();
        e.stopPropagation();
        global.executeCommand('use-recipe');
      }}
      indentWithTab={false}
      basicSetup={basicSetup}
      style={editorStyle}
      autoFocus={autoFocus}
      placeholder=""
    />
  );
});

export default PineInput;
