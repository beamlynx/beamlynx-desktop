import { Box, Button, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useState } from 'react';
import ModalSurface from '../ModalSurface';
import { useStores } from '../../store/store-container';
import type { Recipe } from '../../utils/recipes';
import { openRecipe, recipeHome, type RecipeTarget } from './insertRecipe';

/**
 * Asked when a recipe is used from a tab on another database than the one it
 * was saved from: use it in this tab, on this tab's database (the default, so
 * Enter picks it), or open it in a new tab on the database it was saved
 * from. Arrow keys move between the two. Escape closes it and nothing
 * changes. Used by the Library.
 */
const RecipeDatabaseDialog = observer(
  ({
    recipe,
    onDone,
    onClose,
  }: {
    recipe: Recipe | null;
    // With the id of the tab the recipe went into.
    onDone: (tabId: string) => void;
    onClose: () => void;
  }) => {
    const { global } = useStores();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const home = recipe ? recipeHome(global, recipe) : undefined;
    const session = global.sessions[global.activeSessionId];
    const current = global.connections.find(c => c.id === session?.connectionId);
    const open = !!recipe && !!home;

    // The modal moves focus to its own surface when it opens, which beats
    // autoFocus, so the default button is focused once it has settled.
    const hereRef = useRef<HTMLButtonElement>(null);
    const homeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
      if (!open) return;
      const timer = window.setTimeout(() => hereRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }, [open]);

    const choose = async (target: RecipeTarget) => {
      if (!recipe) return;
      setBusy(true);
      setError('');
      try {
        const tabId = await openRecipe(global, recipe, target);
        if (tabId) onDone(tabId);
        onClose();
      } catch (e) {
        setError(`Couldn't connect to ${home?.label ?? 'its database'}. ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
    };

    return (
      <ModalSurface open={open} onClose={busy ? () => {} : onClose} surfaceSx={{ width: 460, p: 3 }}>
        <Box
          onKeyDown={e => {
            if (busy) return;
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
              e.preventDefault();
              e.stopPropagation();
              (document.activeElement === hereRef.current ? homeRef : hereRef).current?.focus();
              return;
            }
            if (e.key !== 'Enter') return;
            e.stopPropagation();
            // On a button, Enter clicks it. Anywhere else it picks the default.
            if ((e.target as HTMLElement).tagName === 'BUTTON') return;
            e.preventDefault();
            void choose('here');
          }}
        >
          <Typography variant="h6" component="h2" sx={{ color: 'var(--text-color)', fontWeight: 500, mb: 1.5 }}>
            Use this recipe {current ? `on ${current.label}` : 'here'}?
          </Typography>
          <Box sx={{ color: 'var(--text-color)', mb: 3, fontSize: 14, '& p': { m: 0, mb: 1 } }}>
            <p>
              It was saved from <strong>{home?.label}</strong>
              {current ? (
                <>
                  , and this tab is on <strong>{current.label}</strong>
                </>
              ) : null}
              . Tables or columns it uses might not exist here.
            </p>
            {error && <p style={{ color: 'var(--text-warning-color)' }}>{error}</p>}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button
              ref={homeRef}
              onClick={() => void choose('home')}
              disabled={busy}
              sx={{ color: 'var(--text-color)', textTransform: 'none', '&:hover': { backgroundColor: 'var(--hover-color)' } }}
            >
              Open on {home?.label} in a new tab
            </Button>
            <Button
              ref={hereRef}
              onClick={() => void choose('here')}
              variant="contained"
              disabled={busy}
              sx={{ bgcolor: 'var(--primary-color)', color: '#fff', textTransform: 'none', '&:hover': { bgcolor: 'var(--primary-color)', opacity: 0.9 } }}
            >
              Use in this tab
            </Button>
          </Box>
        </Box>
      </ModalSurface>
    );
  },
);

export default RecipeDatabaseDialog;
