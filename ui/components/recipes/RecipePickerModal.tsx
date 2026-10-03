import { Box, Button, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStores } from '../../store/store-container';
import { fillRecipe, type Recipe } from '../../utils/recipes';
import ModalSurface from '../ModalSurface';

/**
 * Ctrl+O: find a recipe and put its query into the current tab. Using a
 * recipe is a macro: the query goes in as plain text with the example values
 * filled in, and the first value is selected so it can be typed over. From
 * then on it's an ordinary query; nothing marks it as a recipe.
 *
 * Recipes are edited later, in the Settings redesign. Until then, Delete is
 * here, so a wrong recipe can be removed and saved again.
 */
const RecipePickerModal = observer(() => {
  const { global } = useStores();
  const open = global.showRecipePicker;

  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    setConfirmDelete(false);
    setError('');
    setRecipes(null);
    // The modal moves focus to its own surface when it opens, which beats
    // autoFocus on the search box, so focus it once the modal has settled.
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    const api = window.beamlynxDesktop?.recipes;
    if (api) api.list().then(setRecipes, e => setError(String(e?.message ?? e)));
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (recipes ?? []).filter(r => {
      const hay = `${r.title} ${r.explanation} ${r.expression}`.toLowerCase();
      return words.every(w => hay.includes(w));
    });
  }, [recipes, query]);

  const index = Math.min(selected, Math.max(0, matches.length - 1));
  const recipe = matches[index];

  useEffect(() => setConfirmDelete(false), [recipe?.id]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const close = () => global.setShowRecipePicker(false);

  const use = (r: Recipe | undefined) => {
    if (!r) return;
    // The Agent and Needs approval tabs belong to the agent, and the next
    // agent query overwrites them, so a recipe goes into a new tab instead.
    const activeId = global.activeSessionId;
    if (activeId === global.mcpSessionId || global.pendingRevealSessionIds.includes(activeId)) global.addTab();
    const session = global.sessions[global.activeSessionId];
    if (!session) return;
    const existing = session.expression.replace(/\s+$/, '');
    const prefix = existing ? `${existing}\n\n` : '';
    const { text, firstValue } = fillRecipe(r.expression, r.inputs);
    const full = prefix + text;
    const selection = firstValue
      ? { anchor: prefix.length + firstValue.from, head: prefix.length + firstValue.to }
      : { anchor: full.length, head: full.length };
    session.setExpressionWithSelection(full, selection);
    close();
  };

  const remove = async () => {
    const api = window.beamlynxDesktop?.recipes;
    if (!recipe || !api) return;
    try {
      await api.delete(recipe.id);
      setRecipes(rs => (rs ?? []).filter(x => x.id !== recipe.id));
      setConfirmDelete(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(Math.min(matches.length - 1, index + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(Math.max(0, index - 1));
    } else if (e.key === 'Enter' && !confirmDelete) {
      e.preventDefault();
      use(recipe);
    }
  };

  const dim = 'var(--node-secondary-text-color)';

  return (
    <ModalSurface
      open={open}
      onClose={close}
      align="top"
      surfaceSx={{ width: 860, maxWidth: 'calc(100vw - 32px)', p: 0, overflow: 'hidden' }}
      onKeyDown={onKeyDown}
      aria-labelledby="recipe-picker-title"
    >
      <Typography id="recipe-picker-title" component="h2" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        Use a recipe
      </Typography>
      <Box sx={{ borderBottom: '1px solid var(--border-color)', px: 2, py: 1.5 }}>
        <Box
          component="input"
          ref={searchRef}
          aria-label="Find a recipe"
          placeholder="Find a recipe"
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          sx={{ width: '100%', font: 'inherit', fontSize: '1rem', color: 'var(--text-color)', background: 'transparent', border: 0, outline: 'none' }}
        />
      </Box>

      {error ? (
        <Typography variant="body2" sx={{ p: 2, color: 'var(--text-warning-color)' }}>
          {error}
        </Typography>
      ) : recipes === null ? (
        <Typography variant="body2" sx={{ p: 2, color: dim }}>
          Loading recipes
        </Typography>
      ) : !matches.length ? (
        <Box sx={{ p: 2, display: 'grid', gap: 0.5 }}>
          <Typography variant="body2" sx={{ color: 'var(--text-color)', fontWeight: 500 }}>
            {recipes.length ? `No recipe matches "${query}".` : 'No recipes yet.'}
          </Typography>
          <Typography variant="body2" sx={{ color: dim }}>
            {recipes.length
              ? 'Try another word.'
              : "Write a query you'll want again, then press Ctrl+S to save it as a recipe."}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)', height: 380 }}>
          <Box ref={listRef} role="listbox" aria-label="Recipes" sx={{ overflow: 'auto', borderRight: '1px solid var(--border-color)' }}>
            {matches.map((r, i) => (
              <Box
                key={r.id}
                data-index={i}
                role="option"
                aria-selected={i === index}
                onClick={() => setSelected(i)}
                onDoubleClick={() => use(r)}
                sx={{
                  px: 2,
                  py: 1,
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-color)',
                  backgroundColor: i === index ? 'var(--node-candidate-bg)' : 'transparent',
                }}
              >
                <Typography variant="body2" sx={{ color: 'var(--text-color)', fontWeight: 500 }}>
                  {r.title}
                </Typography>
                <Typography variant="caption" sx={{ color: dim }}>
                  {r.inputs.length ? r.inputs.map(v => `$${v.name}`).join(', ') : 'No variables'}
                  {r.source === 'agent' ? `   Saved by ${r.agent ?? 'an agent'}` : ''}
                </Typography>
              </Box>
            ))}
          </Box>
          {recipe && (
            <Box sx={{ overflow: 'auto', p: 2, display: 'grid', gap: 1.5, alignContent: 'start' }}>
              {recipe.explanation && (
                <Typography variant="body2" sx={{ color: 'var(--text-color)', whiteSpace: 'pre-wrap' }}>
                  {recipe.explanation}
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
                  border: '1px solid var(--border-color)',
                  borderRadius: 1,
                  p: 1.5,
                }}
              >
                {recipe.expression}
              </Box>
              <Typography variant="caption" sx={{ color: dim }}>
                {recipe.inputs.length
                  ? `Goes into your tab with ${recipe.inputs.map(v => `${v.example} for $${v.name}`).join(', ')}.`
                  : 'Goes into your tab as it is.'}
                {recipe.savedFrom ? ` Saved from ${recipe.savedFrom}.` : ''}
              </Typography>
              {confirmDelete ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, border: '1px solid var(--text-warning-color)', borderRadius: 1, p: 1 }}>
                  <Typography variant="body2" sx={{ color: 'var(--text-color)', flex: 1, minWidth: 160 }}>
                    Delete &quot;{recipe.title}&quot;? This can&apos;t be undone.
                  </Typography>
                  <Button size="small" onClick={() => setConfirmDelete(false)} sx={{ color: 'var(--text-color)' }}>
                    Cancel
                  </Button>
                  <Button size="small" variant="contained" onClick={() => void remove()} sx={{ bgcolor: 'var(--text-warning-color)', color: 'var(--background-color)', '&:hover': { bgcolor: 'var(--text-warning-color)' } }}>
                    Delete recipe
                  </Button>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Button
                    variant="contained"
                    onClick={() => use(recipe)}
                    sx={{ bgcolor: 'var(--primary-color)', color: 'var(--primary-text-color)', '&:hover': { bgcolor: 'var(--primary-color-hover)' } }}
                  >
                    Use in this tab
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  <Button size="small" onClick={() => setConfirmDelete(true)} sx={{ color: 'var(--text-warning-color)' }}>
                    Delete
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}
      <Box sx={{ borderTop: '1px solid var(--border-color)', px: 2, py: 1 }}>
        <Typography variant="caption" sx={{ color: dim }}>
          Enter uses the selected recipe. Arrow keys move. Esc closes.
        </Typography>
      </Box>
    </ModalSurface>
  );
});

export default RecipePickerModal;
