import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import { Close } from '@mui/icons-material';
import { Box, Button, IconButton, ThemeProvider, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStores } from '../../store/store-container';
import { createSettingsTheme } from '../../styles/theme';
import { TEXT_SIZE_SCALE } from '../../styles/text-size';
import { matchRecipes, recipeSummary, savedFromLabel, type Recipe } from '../../utils/recipes';
import { insertRecipe } from './insertRecipe';

/**
 * The sidebar's Library: saved recipes, in the slot Settings docks in
 * (SettingsDock). Desktop only: recipes are stored by beamlynx-desktop.
 *
 * A browsing view of what Ctrl+O's picker (RecipePickerModal) offers: the
 * same search, the same insert (insertRecipe) and the same two-click delete.
 * Unlike the picker, clicking a row selects it and shows its query in place;
 * Use puts it into the tab, and the panel stays open. Editing a recipe is
 * not built yet.
 */
const DELETE_CONFIRM_TIMEOUT_MS = 3000;

const dim = 'var(--node-secondary-text-color)';

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const LibraryPanel = observer(() => {
  const { global } = useStores();

  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Which recipe was just used, and the tab it went into.
  const [used, setUsed] = useState<{ id: string; tab: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const loadSeq = useRef(0);
  // Whether a list is on screen, for a quiet refresh that fails.
  const shown = useRef(false);

  const load = useCallback((quiet: boolean) => {
    const api = window.beamlynxDesktop?.recipes;
    if (!api) return;
    const seq = ++loadSeq.current;
    if (!quiet) {
      shown.current = false;
      setRecipes(null);
      setLoadError('');
    }
    api.list().then(
      list => {
        if (seq !== loadSeq.current) return;
        shown.current = true;
        setRecipes(list);
        setLoadError('');
      },
      e => {
        if (seq !== loadSeq.current) return;
        // A quiet refresh that fails keeps the list already shown, if any.
        if (quiet && shown.current) return;
        setLoadError(e instanceof Error ? e.message : String(e?.message ?? e));
      },
    );
  }, []);

  // Read each time Library opens: it stays mounted through its closing
  // animation (SettingsDock), and another window or an agent may have saved
  // or deleted recipes meanwhile.
  const isOpen = global.showLibrary;
  useEffect(() => {
    if (!isOpen) return;
    setUsed(null);
    setConfirmingId(null);
    load(false);
  }, [isOpen, load]);

  // And again, quietly, whenever a recipe is saved with Ctrl+S while it is open.
  const changed = global.recipesChangedCount;
  const seenChange = useRef(changed);
  useEffect(() => {
    if (changed === seenChange.current) return;
    seenChange.current = changed;
    if (global.showLibrary) load(true);
  }, [changed, global, load]);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  const matches = useMemo(() => matchRecipes(recipes ?? [], query), [recipes, query]);
  // The selected recipe if the search still shows it, else the first match.
  const selected = matches.find(r => r.id === selectedId) ?? matches[0];
  const selectedIndex = selected ? matches.indexOf(selected) : -1;

  useEffect(() => {
    if (!selected) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-recipe-id="${CSS.escape(selected.id)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const select = (r: Recipe) => {
    setSelectedId(r.id);
    if (used && used.id !== r.id) setUsed(null);
  };

  const applyRecipe = (r: Recipe | undefined) => {
    if (!r) return;
    const tabId = insertRecipe(global, r);
    if (!tabId) return;
    setSelectedId(r.id);
    setUsed({ id: r.id, tab: global.getSessionName(tabId) });
  };

  // First click arms it, a second within 3 seconds deletes.
  const onDeleteClick = async (r: Recipe) => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    if (confirmingId !== r.id) {
      setConfirmingId(r.id);
      confirmTimer.current = setTimeout(() => setConfirmingId(null), DELETE_CONFIRM_TIMEOUT_MS);
      return;
    }
    setConfirmingId(null);
    const api = window.beamlynxDesktop?.recipes;
    if (!api) return;
    try {
      await api.delete(r.id);
      setError('');
      setRecipes(rs => (rs ?? []).filter(x => x.id !== r.id));
      if (used?.id === r.id) setUsed(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Up and Down move the selection and Enter uses it, as in Ctrl+O's picker.
  // Listened for on the document, like Settings' keys
  // (useSettingsKeybindings): opening Library focuses the docked panel's
  // root (SettingsDockedPanel), which sits above this component, so a
  // handler on this component's own box would never see those keys. Only
  // keys from inside the Library panel, or from nowhere in particular,
  // count: a dialog on top (the Ctrl+O picker) or the editor keeps its own.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => undefined);
  onKey.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!global.showLibrary || global.activeKeyboardPanel !== 'library') return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target && target !== document.body && !target.closest('[data-keyboard-panel="library"]')) return;
    if (!matches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      select(matches[Math.min(matches.length - 1, selectedIndex + 1)]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      select(matches[Math.max(0, selectedIndex - 1)]);
    } else if (e.key === 'Enter') {
      // Use, delete, Try again and Clear search keep Enter as a click. A
      // row's own button doesn't: Enter there uses the selected recipe,
      // which Up and Down may have moved away from the focused row.
      if (target?.tagName === 'BUTTON' && !target.hasAttribute('data-recipe-select')) return;
      e.preventDefault();
      applyRecipe(selected);
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey.current(e);
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Same frozen text scale as Settings (SettingsPanelContent), whose slot this is.
  const theme = useMemo(
    () => createSettingsTheme(global.themeId, TEXT_SIZE_SCALE[global.textSize]),
    [global.themeId, global.textSize],
  );

  const count = recipes && !loadError ? recipes.length : 0;

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <Box role="alert" sx={{ display: 'grid', gap: 1.5, justifyItems: 'start', py: 1 }}>
        <Typography
          variant="body2"
          sx={{ color: 'var(--text-warning-color)', overflowWrap: 'anywhere' }}
        >
          {loadError}
        </Typography>
        <Button variant="outlined" size="small" onClick={() => load(false)}>
          Try again
        </Button>
      </Box>
    );
  } else if (recipes === null) {
    body = (
      <Typography variant="body2" aria-busy="true" sx={{ color: dim, py: 1 }}>
        Loading recipes
      </Typography>
    );
  } else if (!recipes.length) {
    body = (
      <Box sx={{ display: 'grid', gap: 0.5, py: 1 }}>
        <Typography variant="body2" sx={{ color: 'var(--text-color)', fontWeight: 500 }}>
          No recipes yet.
        </Typography>
        <Typography variant="body2" sx={{ color: dim }}>
          Write a query you&apos;ll want again, then press Ctrl+S to save it as a recipe.
        </Typography>
      </Box>
    );
  } else if (!matches.length) {
    body = (
      <Box sx={{ display: 'grid', gap: 0.5, py: 1, justifyItems: 'start' }}>
        <Typography
          variant="body2"
          sx={{ color: 'var(--text-color)', fontWeight: 500, overflowWrap: 'anywhere' }}
        >
          No recipe matches &quot;{query}&quot;.
        </Typography>
        <Button size="small" onClick={() => setQuery('')} sx={{ px: 0, minWidth: 0 }}>
          Clear search
        </Button>
      </Box>
    );
  } else {
    body = (
      <Box
        ref={listRef}
        role="list"
        aria-label="Recipes"
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          mx: -3,
          borderTop: '1px solid var(--border-color)',
        }}
      >
        {matches.map(r => {
          const isSelected = selected?.id === r.id;
          const armed = confirmingId === r.id;
          return (
            <Box
              key={r.id}
              role="listitem"
              data-recipe-id={r.id}
              sx={{
                borderBottom: '1px solid var(--border-color)',
                backgroundColor: isSelected ? 'var(--node-candidate-bg)' : 'transparent',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 3, py: 1 }}>
                <Box
                  component="button"
                  type="button"
                  data-recipe-select
                  aria-expanded={isSelected}
                  onClick={() => select(r)}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'left',
                    border: 0,
                    p: 0,
                    background: 'transparent',
                    font: 'inherit',
                    color: 'inherit',
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 0.25,
                  }}
                >
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ color: 'var(--text-color)', fontWeight: 500, overflowWrap: 'anywhere' }}
                  >
                    {r.title}
                    {r.source === 'agent' && (
                      <Box
                        component="span"
                        sx={{
                          ml: 1,
                          px: 0.75,
                          py: '1px',
                          borderRadius: 1,
                          fontSize: '0.7rem',
                          fontWeight: 500,
                          verticalAlign: 'middle',
                          whiteSpace: 'nowrap',
                          color: 'var(--text-color)',
                          backgroundColor: 'var(--canvas-chip-bg, var(--node-column-bg))',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        {r.agent ?? 'agent'}
                      </Box>
                    )}
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{
                      color: armed ? 'var(--text-warning-color)' : dim,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {armed ? 'Click again to delete' : recipeSummary(r) || 'No comment'}
                  </Typography>
                </Box>
                <Box
                  component="button"
                  type="button"
                  aria-label={armed ? `Click again to delete ${r.title}` : `Delete ${r.title}`}
                  title={armed ? 'Click again to delete' : 'Delete recipe'}
                  onClick={() => void onDeleteClick(r)}
                  sx={{
                    display: 'inline-flex',
                    flexShrink: 0,
                    border: 0,
                    background: 'transparent',
                    p: 0.5,
                    cursor: 'pointer',
                    color: armed ? 'var(--text-warning-color)' : 'var(--text-color)',
                    opacity: armed ? 1 : 0.35,
                    '&:hover, &:focus-visible': { opacity: 0.9 },
                  }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </Box>
              </Box>
              {isSelected && (
                <Box sx={{ px: 3, pb: 1.5, display: 'grid', gap: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'grid', gap: 0.25, minWidth: 0 }}>
                    <Typography variant="caption" sx={{ color: dim }}>
                      {r.source === 'agent'
                        ? `Saved by ${r.agent ?? 'an agent'}, updated`
                        : 'Updated'}{' '}
                      {formatDate(r.updatedAt)}
                    </Typography>
                    {savedFromLabel(r.savedFrom, global.connections) && (
                      <Typography
                        variant="caption"
                        title={`Saved from ${savedFromLabel(r.savedFrom, global.connections)}`}
                        sx={{
                          color: dim,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Saved from {savedFromLabel(r.savedFrom, global.connections)}
                      </Typography>
                    )}
                    {/* Recipes saved with the old dialog keep their values as a list. */}
                    {r.inputs.length > 0 && (
                      <Typography variant="caption" sx={{ color: dim }}>
                        Sets{' '}
                        {r.inputs.map(v => `$${v.name} to ${v.example || 'nothing'}`).join(', ')}.
                      </Typography>
                    )}
                  </Box>
                  {r.explanation && (
                    <Typography
                      variant="body2"
                      sx={{
                        color: 'var(--text-color)',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {r.explanation}
                    </Typography>
                  )}
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      fontFamily: 'var(--code-font)',
                      fontSize: '0.85rem',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: 'var(--text-color)',
                      backgroundColor: 'var(--background-color)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 1,
                      p: 1.5,
                    }}
                  >
                    {r.expression}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Button
                      variant="contained"
                      size="small"
                      disableElevation
                      onClick={() => applyRecipe(r)}
                    >
                      Use
                    </Button>
                    {used?.id === r.id ? (
                      <Typography
                        variant="caption"
                        role="status"
                        sx={{ color: 'var(--text-color)' }}
                      >
                        Added to the end of {used.tab}
                      </Typography>
                    ) : (
                      <Typography variant="caption" sx={{ color: dim }}>
                        Adds the query to the end of the current tab. Nothing runs.
                      </Typography>
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* The same close button as Settings' (SettingsPanelContent). */}
        <IconButton
          onClick={() => global.setShowLibrary(false)}
          size="small"
          tabIndex={-1}
          aria-label="Close Library"
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 1,
            color: 'var(--text-color)',
            '&:hover': { backgroundColor: 'var(--hover-color)' },
          }}
        >
          <Close fontSize="small" />
        </IconButton>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            p: 3,
            pb: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          <Typography
            variant="h6"
            component="h2"
            sx={{ color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: 1 }}
          >
            Library
            {count > 0 && (
              <Box
                component="span"
                aria-label={`${count} recipes`}
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  px: 0.75,
                  borderRadius: 1,
                  color: dim,
                  border: '1px solid var(--border-color)',
                }}
              >
                {count}
              </Box>
            )}
          </Typography>

          {count > 0 && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                py: 0.5,
                border: '1px solid var(--border-color)',
                borderRadius: 1,
                '&:focus-within': { borderColor: 'var(--primary-color)' },
              }}
            >
              <SearchIcon sx={{ fontSize: 18, color: dim }} />
              <Box
                component="input"
                type="search"
                aria-label="Find a recipe"
                placeholder="Find a recipe"
                autoComplete="off"
                value={query}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  // Typing here is for the search only, never the canvas
                  // behind it. Shortcuts with a modifier (Ctrl+O, Ctrl+S)
                  // still reach the app.
                  if (
                    !e.ctrlKey &&
                    !e.metaKey &&
                    !e.altKey &&
                    e.key !== 'ArrowUp' &&
                    e.key !== 'ArrowDown' &&
                    e.key !== 'Enter'
                  ) {
                    e.stopPropagation();
                  }
                }}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  font: 'inherit',
                  fontSize: '0.875rem',
                  color: 'var(--text-color)',
                  background: 'transparent',
                  border: 0,
                  outline: 'none',
                  py: 0.5,
                }}
              />
            </Box>
          )}

          {error && (
            <Typography variant="caption" role="alert" sx={{ color: 'var(--text-warning-color)' }}>
              {error}
            </Typography>
          )}

          {body}
        </Box>

        <Box sx={{ borderTop: '1px solid var(--border-color)', px: 3, py: 1 }}>
          <Typography variant="caption" sx={{ color: dim }}>
            Up and Down move, Enter uses. Ctrl+O opens the same recipes as a quick picker.
          </Typography>
        </Box>
      </Box>
    </ThemeProvider>
  );
});

export default LibraryPanel;
