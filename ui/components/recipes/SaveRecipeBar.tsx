import { Box, Button, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '../../store/session';
import { useStores } from '../../store/store-container';
import { draftFromTab } from '../../utils/recipes';

/**
 * Ctrl+S: a one-line bar above the tab, asking only for a title. It saves the
 * block under the cursor, plus any block above it that the query uses, as it
 * is: its comments are the recipe's explanation. No dialog, so the query and
 * canvas stay in view.
 *
 * Variables aren't chosen here: a query saved with $variables keeps them,
 * and what's in the Variables strip is saved as their examples.
 */
const SaveRecipeBar = observer(({ session }: { session: Session }) => {
  const { global } = useStores();
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Follows the cursor while the bar is open, so it's always the block that
  // would be saved right now.
  const draft = useMemo(
    () => draftFromTab(session.expression, session.cursorPosition?.line),
    [session.expression, session.cursorPosition?.line],
  );

  // Offer a title once, when the bar opens.
  useEffect(() => {
    setTitle(draft?.title ?? '');
    setError('');
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the title, selected so typing replaces it: when the bar opens, and
  // again on every Ctrl+S while it's open.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [global.saveRecipeRequestCount]);

  const close = () => {
    global.setShowSaveRecipe(false);
    session.focusTextInput();
  };

  const save = async () => {
    const api = window.beamlynxDesktop?.recipes;
    if (!draft || !api || !title.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      // The query's $variables are saved with what's in the Variables strip
      // now, as their examples: using the recipe fills the strip with them.
      const inputs = (session.variablesReport?.used ?? [])
        .filter(name => new RegExp(`\\$${name}(?![A-Za-z0-9_])`).test(draft.expression))
        .map(name => ({ name, example: (session.variableValues[name] ?? '').trim(), kind: 'string' as const }));
      const saved = await api.save(
        { title: title.trim(), expression: draft.expression, inputs },
        session.profileId || undefined,
      );
      runInAction(() => {
        session.message = `Saved recipe "${saved.title}". Press Ctrl+O to use it.`;
      });
      close();
    } catch (e) {
      setError(
        e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e),
      );
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const saveKey = e.key === 'Enter' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's');
    if (saveKey) {
      e.preventDefault();
      e.stopPropagation();
      void save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const dim = 'var(--node-secondary-text-color)';
  const note = !draft
    ? 'There is no query to save. Write one first.'
    : error ||
      (draft.includedNames.length
        ? `Saves the query under the cursor, with the block above that defines ${draft.includedNames.join(', ')}. Comments are saved with it.`
        : 'Saves the query under the cursor. Comments are saved with it.');

  return (
    <Box
      role="group"
      aria-label="Save as recipe"
      onKeyDown={onKeyDown}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 1.5,
        rowGap: 0.5,
        px: 1.5,
        py: 1,
        mb: 1,
        border: '1px solid var(--border-color)',
        borderRadius: 1,
        backgroundColor: 'var(--node-column-bg)',
      }}
    >
      <Typography variant="body2" sx={{ color: 'var(--text-color)', fontWeight: 500, whiteSpace: 'nowrap' }}>
        Save as recipe
      </Typography>
      <Box
        component="input"
        ref={inputRef}
        aria-label="Recipe title"
        placeholder="Title"
        maxLength={200}
        value={title}
        disabled={!draft}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
        sx={{
          flex: '1 1 260px',
          minWidth: 0,
          font: 'inherit',
          fontSize: '0.9rem',
          color: 'var(--text-color)',
          backgroundColor: 'var(--background-color)',
          border: '1px solid var(--border-color)',
          borderRadius: 1,
          px: 1,
          py: 0.5,
          outline: 'none',
          '&:focus': { borderColor: 'var(--focus-border-color)' },
        }}
      />
      <Button size="small" onClick={close} sx={{ color: 'var(--text-color)' }}>
        Cancel
      </Button>
      <Button
        size="small"
        variant="contained"
        onClick={() => void save()}
        disabled={!draft || !title.trim() || saving}
        sx={{
          bgcolor: 'var(--primary-color)',
          color: 'var(--primary-text-color)',
          '&:hover': { bgcolor: 'var(--primary-color-hover)' },
        }}
      >
        Save
      </Button>
      <Typography
        variant="caption"
        sx={{ flexBasis: '100%', color: error ? 'var(--text-warning-color)' : dim }}
      >
        {note}
      </Typography>
    </Box>
  );
});

export default SaveRecipeBar;
