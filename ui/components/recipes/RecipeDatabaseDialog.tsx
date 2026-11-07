import { Box, Button, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useState } from 'react';
import ModalSurface from '../ModalSurface';
import { useStores } from '../../store/store-container';
import type { Recipe } from '../../utils/recipes';
import { openRecipe, recipeHome, type RecipeTarget } from './insertRecipe';

/**
 * Asked when a recipe is used from a tab on another database than the one it
 * was saved from: switch this tab to that database (the default, so Enter
 * picks it), or open it in a new tab. Used by the Library. Escape closes it
 * and nothing changes.
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
    const current = global.connections.find(c => c.id === session?.profileId);
    const tabHasQuery = !!session?.expression.trim();
    const open = !!recipe && !!home;

    // The modal moves focus to its own surface when it opens, which beats
    // autoFocus, so the default button is focused once it has settled.
    const switchRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
      if (!open) return;
      const timer = window.setTimeout(() => switchRef.current?.focus(), 0);
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
        {/* Enter anywhere but on the other button switches: the default. */}
        <Box
          onKeyDown={e => {
            if (e.key !== 'Enter' || busy) return;
            e.stopPropagation();
            if ((e.target as HTMLElement).tagName === 'BUTTON') return;
            e.preventDefault();
            void choose('switch');
          }}
        >
        <Typography variant="h6" component="h2" sx={{ color: 'var(--text-color)', fontWeight: 500, mb: 1.5 }}>
          Switch this tab to {home?.label}?
        </Typography>
        <Box sx={{ color: 'var(--text-color)', mb: 3, fontSize: 14, '& p': { m: 0, mb: 1 } }}>
          <p>
            This recipe was saved from <strong>{home?.label}</strong>
            {current ? (
              <>
                , and this tab is on <strong>{current.label}</strong>
              </>
            ) : null}
            .
          </p>
          <p>
            {tabHasQuery
              ? `Its query goes at the end of this tab, and the queries already here run on ${home?.label} too.`
              : 'Its query goes in this tab.'}
          </p>
          {error && <p style={{ color: 'var(--text-warning-color)' }}>{error}</p>}
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button
            onClick={() => void choose('new')}
            disabled={busy}
            sx={{ color: 'var(--text-color)', '&:hover': { backgroundColor: 'var(--hover-color)' } }}
          >
            Open in a new tab
          </Button>
          <Button
            ref={switchRef}
            onClick={() => void choose('switch')}
            variant="contained"
            disabled={busy}
            sx={{ bgcolor: 'var(--primary-color)', color: '#fff', '&:hover': { bgcolor: 'var(--primary-color)', opacity: 0.9 } }}
          >
            Switch this tab
          </Button>
        </Box>
        </Box>
      </ModalSurface>
    );
  },
);

export default RecipeDatabaseDialog;
