import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { Box, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStores } from '../../store/store-container';
import { recipeSummary, recipeText, textToInsert, type Recipe } from '../../utils/recipes';
import ModalSurface from '../ModalSurface';

/**
 * Ctrl+O: find a recipe and put its query into the current tab. Using a
 * recipe is a macro: the query goes in as plain text with the example values
 * filled in, and the first value is selected so it can be typed over. From
 * then on it's an ordinary query; nothing marks it as a recipe.
 *
 * Clicking a recipe (or Enter) uses it; hovering or the arrow keys show its
 * query on the right. Each row has a delete icon, confirmed by a second click
 * within 3 seconds, the same as a database connection's. Recipes are edited
 * later, in the Settings redesign; until then a wrong one can be deleted and
 * saved again.
 */
const DELETE_CONFIRM_TIMEOUT_MS = 3000;

const RecipePickerModal = observer(() => {
  const { global } = useStores();
  const open = global.showRecipePicker;

  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    setConfirmingId(null);
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

  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);
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
    const full = prefix + textToInsert(existing, recipeText(r));
    session.setExpressionWithSelection(full, { anchor: full.length, head: full.length });
    close();
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
      setRecipes(rs => (rs ?? []).filter(x => x.id !== r.id));
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
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
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
      // Not flush with the top like the command palette, which drops down
      // from the header's search box. Anchored by its top edge rather than
      // centered, so it doesn't jump as the list filters.
      sx={{ paddingTop: '12vh' }}
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
                title="Use in this tab"
                onClick={() => use(r)}
                onMouseEnter={() => setSelected(i)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1,
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-color)',
                  backgroundColor: i === index ? 'var(--node-candidate-bg)' : 'transparent',
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ color: 'var(--text-color)', fontWeight: 500 }}>
                    {r.title}
                  </Typography>
                  <Typography variant="caption" sx={{ color: confirmingId === r.id ? 'var(--text-warning-color)' : dim }}>
                    {confirmingId === r.id
                      ? 'Click again to delete'
                      : [recipeSummary(r), r.source === 'agent' ? `Saved by ${r.agent ?? 'an agent'}` : '']
                          .filter(Boolean)
                          .join('. ')}
                  </Typography>
                </Box>
                <Box
                  component="button"
                  type="button"
                  aria-label={confirmingId === r.id ? `Click again to delete ${r.title}` : `Delete ${r.title}`}
                  title={confirmingId === r.id ? 'Click again to delete' : 'Delete recipe'}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    void onDeleteClick(r);
                  }}
                  sx={{
                    display: 'inline-flex',
                    border: 0,
                    background: 'transparent',
                    p: 0.5,
                    cursor: 'pointer',
                    color: confirmingId === r.id ? 'var(--text-warning-color)' : 'var(--text-color)',
                    opacity: confirmingId === r.id ? 1 : 0.35,
                    '&:hover, &:focus-visible': { opacity: 0.9 },
                  }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </Box>
              </Box>
            ))}
          </Box>
          {recipe && (
            <Box sx={{ overflow: 'auto', p: 2, display: 'grid', gap: 1.5, alignContent: 'start' }}>
              {/* Context, not something to act on: one dim line at the top, so
                  it never needs scrolling to, cut short if the address is long. */}
              {recipe.savedFrom && (
                <Typography
                  variant="caption"
                  title={`Saved from ${recipe.savedFrom}`}
                  sx={{ color: dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  Saved from {recipe.savedFrom}
                </Typography>
              )}
              {/* Recipes saved with the old dialog keep their values as a list;
                  they go in as a values block above the query. */}
              {recipe.inputs.length > 0 && (
                <Typography variant="caption" sx={{ color: dim }}>
                  Sets {recipe.inputs.map(v => `$${v.name} to ${v.example || 'nothing'}`).join(', ')}.
                </Typography>
              )}
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
            </Box>
          )}
        </Box>
      )}
      <Box sx={{ borderTop: '1px solid var(--border-color)', px: 2, py: 1 }}>
        <Typography variant="caption" sx={{ color: dim }}>
          Click a recipe or press Enter to use it. Arrow keys move. Esc closes.
        </Typography>
      </Box>
    </ModalSurface>
  );
});

export default RecipePickerModal;
