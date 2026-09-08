import { Box, Divider, IconButton, Drawer, Tooltip, Typography } from '@mui/material';
import { Check, Close, Code, ContentCopy, Edit, Undo } from '@mui/icons-material';
import { json } from '@codemirror/lang-json';
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { vim } from '@replit/codemirror-vim';
import CodeMirror from '@uiw/react-codemirror';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_JSON_PANEL_WIDTH, MIN_JSON_PANEL_WIDTH } from '../constants';
import { useResizeDrag } from '../hooks/useResizeDrag';
import { getUserPreference, STORAGE_KEYS } from '../store/preferences';
import { useStores } from '../store/store-container';
import { editorChrome, editorDarkSyntax } from './editor-theme';
import { prettyJson } from './json-cell.util';

interface JsonInspectorPanelProps {
  open: boolean;
  title: string;
  parsed: unknown;
  isDark: boolean;
  editing: boolean;
  onClose: () => void;
  onCopy: () => void;
  onEditStart: () => void;
  onCancelEdit: () => void;
  onCommit: (text: string) => Promise<boolean>;
  onInspect: (text: string) => void;
}

/**
 * The one place a JSON cell's value is viewed AND edited - opened by
 * clicking the cell (JsonCellContent), closed by its own X, Escape, or the
 * backdrop. Earlier rounds of this feature split viewing (this panel),
 * editing (a separate CodeMirror grown into the grid row) and "inspect the
 * update query" (a Modal) into three different surfaces with three
 * different feels; that's what read as inconsistent, not any one of them
 * individually. Now there's exactly one surface.
 *
 * Opens directly into edit mode - clicking a cell IS the edit gesture, not
 * a step before it (an Edit button you had to find and click first was its
 * own complaint). View mode still exists - Cancel lands there rather than
 * closing outright, so you can look at the clean committed value or copy
 * it without your discarded edits - and its own Edit button is how you get
 * back into editing from there. Inspect is still a modal, but it's an
 * opt-in secondary action that predates JSON cells entirely and applies to
 * every column, not a second primary way to edit this one.
 *
 * MUI's `Drawer` is fixed-position - nothing to re-anchor on scroll, no
 * content-driven width to jitter between cells - and styled to read as an
 * integrated panel rather than a floating card (no shadow, flush to the
 * viewport edge, `--background-color`/`--border-color` tokens matching
 * SettingsDockedPanel.tsx) even though it overlays rather than resizing the
 * layout - see this component's own git history for that tradeoff.
 */
const JsonInspectorPanel: React.FC<JsonInspectorPanelProps> = ({
  open,
  title,
  parsed,
  isDark,
  editing,
  onClose,
  onCopy,
  onEditStart,
  onCancelEdit,
  onCommit,
  onInspect,
}) => {
  const { global } = useStores();
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  // Seeded with the constant, not a lazy getUserPreference(...) initializer
  // - matches AppView.tsx's own settingsPanelWidth (same reasoning): reading
  // localStorage during the initial render would disagree with SSR's markup
  // (no window there, see getUserPreference's own guard), so the persisted
  // width is instead loaded in the mount effect below, same as Settings'.
  const [width, setWidth] = useState(DEFAULT_JSON_PANEL_WIDTH);
  useEffect(() => {
    setWidth(getUserPreference(STORAGE_KEYS.JSON_PANEL_WIDTH, DEFAULT_JSON_PANEL_WIDTH));
  }, []);
  // invert: true - the divider sits at the panel's LEFT edge, but the panel
  // itself is anchored to the viewport's right edge (Drawer anchor="right")
  // and grows leftward, the opposite of useResizeDrag's default assumption
  // (a resizable box growing in the same direction as the drag, away from
  // its own fixed edge on the left). Without this, dragging left - the
  // direction that should widen the panel - would narrow it instead.
  const onResizeMouseDown = useResizeDrag({
    value: width,
    setValue: setWidth,
    min: MIN_JSON_PANEL_WIDTH,
    max: () => window.innerWidth * 0.7,
    storageKey: STORAGE_KEYS.JSON_PANEL_WIDTH,
    axis: 'x',
    invert: true,
  });
  // Whether the text has actually changed since edit mode started - read by
  // handleClose below so a stray Escape or backdrop click can't silently
  // throw away an in-progress edit (see this component's own history: this
  // is exactly the kind of thing a previous round didn't guard and got
  // flagged for). Read-only viewing has nothing to lose, so it's always
  // fine to close.
  const dirtyRef = useRef(false);
  const textRef = useRef('');
  // Clicking a cell opens the panel already in edit mode (see
  // JsonCellContent's onOpen) - handleEditStart below still seeds textRef
  // for the Cancel-then-Edit-again path, but that's a click, which happens
  // in its own render after this one; the FIRST render of a freshly opened
  // panel has no button click to hang a seed off, and needs textRef ready
  // before the <CodeMirror key="edit"> below reads it in THIS SAME render -
  // a useEffect would run too late (after CodeMirror has already mounted
  // with whatever textRef held from the previous cell, or empty on the
  // very first open). Comparing against the previous render's `open` here,
  // during render, is the supported way to react to a prop transition
  // before this render's own JSX is built (see React's docs on adjusting
  // state during rendering) - `open` can only go false->true when Result.tsx
  // has pointed jsonPanel at a genuinely different cell (the Drawer's own
  // backdrop blocks clicking a different cell while one is already open),
  // so this can't fire on a re-render of the same open cell.
  const wasOpenRef = useRef(false);
  // `parsed !== undefined` guards against seeding the editor with the
  // literal string "undefined" - open and parsed are computed from the same
  // Result.tsx render (open is `!!jsonPanel && jsonPanelParsed !== undefined`),
  // so parsed is already populated whenever open first flips true, but
  // nothing here should rely on that ordering staying true elsewhere.
  if (open && !wasOpenRef.current && parsed !== undefined) {
    textRef.current = prettyJson(parsed);
    dirtyRef.current = false;
    if (invalid) setInvalid(false);
  }
  wasOpenRef.current = open;
  // The memoized keymap below (deliberately kept stable across renders, not
  // rebuilt per keystroke - see its own comment) closes over handleCommit
  // from whichever render last recreated it. handleCommit itself calls
  // onCommit, a prop that's a fresh closure over Result.tsx's `rows`/
  // `session` every render - calling a stale one from the keymap could
  // commit against a stale row snapshot. Routing through a ref that's
  // reassigned every render (a plain render-time write, not an effect - by
  // the time Mod-Enter can fire, at least one render has already happened)
  // means the keymap always reaches the CURRENT onCommit regardless of when
  // its own closure was captured.
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  // Shared by both modes - language, chrome/syntax colors.
  const baseExtensions = useMemo(
    () => [json(), editorChrome(isDark), ...(isDark ? [editorDarkSyntax] : [])],
    [isDark],
  );

  // View mode is read-only, so vim (an editing mode) and the commit/cancel
  // keymaps below have nothing to do there - kept as its own memo rather
  // than reusing editExtensions with editable={false}, so toggling vim mode
  // never has to reconfigure the (unrelated) view-mode editor.
  const viewExtensions = baseExtensions;

  // Edit mode's own extensions - vim() first (Prec.high, same precedence
  // PineInput.tsx gives it) so it gets first claim on every key it defines,
  // Escape included: in insert mode that's vim's own exit-to-normal-mode,
  // not "leave the panel" (confirmed live: without vim() at all, Escape had
  // nothing to bind it, so every press bubbled straight out of CodeMirror
  // to the Drawer's onClose). Mod-Enter (save) is Prec.highest so it always
  // wins regardless of vim mode/state.
  //
  // The Prec.lowest Escape binding below is what stops a bare Escape from
  // reaching the Drawer at all once focus is inside the editor - it fires
  // only once nothing else (vim, or CodeMirror's own defaults) has already
  // consumed the key (vim already in normal mode, or vim mode off), and
  // deliberately just swallows it rather than canceling the edit -
  // discarding typed text on a stray Escape (a key vim users rest on
  // constantly) would trade "the panel disappears" for "my edit
  // disappears", not actually fix the complaint. Cancel stays a deliberate
  // action (the Undo button, or handleCancelEdit some other way) rather
  // than something a single misplaced keystroke can trigger.
  //
  // Tradeoff: this also swallows Escape from any CodeMirror built-in that
  // might otherwise want it (closing an autocomplete tooltip, an open
  // search panel) while vim is off/in normal mode - neither is wired up
  // here today, so there's nothing for it to break yet, but a future
  // extension that binds Escape itself needs a higher Prec than this one.
  const editExtensions = useMemo(
    () => [
      ...baseExtensions,
      ...(global.vimMode ? [Prec.high(vim())] : []),
      Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => (handleCommit(), true) }])),
      Prec.lowest(keymap.of([{ key: 'Escape', run: () => true }])),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseExtensions, global.vimMode],
  );

  const handleClose = () => {
    if (editing && dirtyRef.current) return;
    onClose();
  };

  const handleEditStart = () => {
    textRef.current = prettyJson(parsed);
    dirtyRef.current = false;
    setInvalid(false);
    onEditStart();
  };

  const handleCancelEdit = () => {
    dirtyRef.current = false;
    setInvalid(false);
    onCancelEdit();
  };

  const handleCommit = async () => {
    setSaving(true);
    const ok = await onCommitRef.current(textRef.current);
    setSaving(false);
    if (ok) {
      dirtyRef.current = false;
      setInvalid(false);
    } else {
      setInvalid(true);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      elevation={0}
      PaperProps={{
        sx: {
          width,
          boxShadow: 'none',
          borderRadius: 0,
          bgcolor: 'var(--background-color)',
          borderLeft: '1px solid var(--border-color)',
        },
      }}
    >
      <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Divider
          orientation="vertical"
          onMouseDown={onResizeMouseDown}
          sx={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '6px',
            cursor: 'col-resize',
            opacity: 0,
            zIndex: 1,
            '&:hover': {
              backgroundColor: 'action.hover',
              transition: 'background-color 0.2s',
              opacity: 1,
            },
          }}
        />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.5,
            py: 1,
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: 'var(--text-color)',
              fontFamily: 'var(--code-font)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
            {editing ? (
              <>
                <Tooltip
                  title={
                    invalid
                      ? 'Fix JSON to inspect the update'
                      : 'Inspect update (opens update modal)'
                  }
                >
                  <span>
                    <IconButton
                      size="small"
                      disabled={invalid}
                      onClick={() => onInspect(textRef.current)}
                    >
                      <Code fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Cancel (discards changes, back to viewing)">
                  <IconButton size="small" onClick={handleCancelEdit}>
                    <Undo fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Save (Mod+Enter)">
                  <IconButton size="small" onClick={handleCommit} disabled={saving}>
                    <Check fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            ) : (
              <>
                <Tooltip title="Copy formatted JSON">
                  <IconButton size="small" onClick={onCopy}>
                    <ContentCopy fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={handleEditStart}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Close">
                  <IconButton size="small" onClick={onClose}>
                    <Close fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>
        </Box>
        {invalid && (
          <Typography variant="caption" sx={{ color: '#d32f2f', px: 1.5, py: 0.5 }}>
            Invalid JSON - fix it before saving
          </Typography>
        )}
        {/* flex:1 + minHeight:0 is what lets this box actually take up the
            rest of the panel's height instead of growing to fit its own
            content (a plain flex:1 child won't shrink below content size on
            its own). CodeMirror itself is left with no `height` prop, so it
            sizes to the JSON's own content height (short values don't leave
            dead space, and there's no fixed number to get wrong) - this
            box's overflow:auto is what puts the scrollbar here, exactly
            when the content is taller than the space available. */}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            // Themed rather than the OS default - matches ChangelogModal.tsx/
            // CommandPalette.tsx's own scrollbar treatment (same tokens), not
            // a new style invented for this panel.
            '&::-webkit-scrollbar': {
              width: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'var(--border-color)',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: 'var(--text-color)',
              opacity: 0.5,
            },
          }}
        >
          {editing ? (
            <CodeMirror
              key="edit"
              value={textRef.current}
              autoFocus
              theme="none"
              basicSetup={{ foldGutter: true, highlightActiveLine: false }}
              indentWithTab={false}
              extensions={editExtensions}
              onChange={newText => {
                textRef.current = newText;
                dirtyRef.current = true;
                setInvalid(false);
              }}
            />
          ) : (
            <CodeMirror
              key="view"
              value={prettyJson(parsed)}
              theme="none"
              editable={false}
              basicSetup={{ foldGutter: true, highlightActiveLine: false }}
              extensions={viewExtensions}
            />
          )}
        </Box>
      </Box>
    </Drawer>
  );
};

export default JsonInspectorPanel;
