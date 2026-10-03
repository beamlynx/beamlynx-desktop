import { Box, Button, TextField, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStores } from '../../store/store-container';
import { applyVariables, draftFromTab, findLiterals, type SaveDraft } from '../../utils/recipes';
import ModalSurface from '../ModalSurface';

/**
 * Ctrl+S: save the query under the cursor as a recipe. The values typed into
 * the query are shown as buttons; clicking one turns it into a variable,
 * filled in each time the recipe is used, with what was typed kept as its
 * example. Recipes are global (offered on every database) and stored by the
 * desktop app. See utils/recipes.ts.
 */
const SaveRecipeModal = observer(() => {
  const { global } = useStores();
  const open = global.showSaveRecipe;
  const session = global.sessions[global.activeSessionId];

  const [draft, setDraft] = useState<SaveDraft | null>(null);
  const [title, setTitle] = useState('');
  const [explanation, setExplanation] = useState('');
  const [chosen, setChosen] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Read the tab once each time the sheet opens, not on every render: the
  // sheet is about the query as it was when Ctrl+S was pressed.
  useEffect(() => {
    if (!open || !session) return;
    const d = draftFromTab(session.expression, session.cursorPosition?.line);
    setDraft(d);
    setTitle(d?.title ?? '');
    setExplanation(d?.explanation ?? '');
    setChosen({});
    setError('');
    setSaving(false);
    // The modal moves focus to its own surface when it opens, which beats
    // autoFocus, so focus the title once the modal has settled.
    const focusTimer = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const literals = useMemo(() => (draft ? findLiterals(draft.expression) : []), [draft]);

  const close = () => global.setShowSaveRecipe(false);

  const save = async () => {
    const api = window.beamlynxDesktop?.recipes;
    if (!draft || !api || !title.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const { expression, inputs } = applyVariables(draft.expression, literals, chosen);
      const saved = await api.save(
        { title: title.trim(), explanation: explanation.trim(), expression, inputs },
        session?.profileId || undefined,
      );
      close();
      if (session) {
        runInAction(() => {
          session.message = `Saved recipe "${saved.title}". Press Ctrl+O to use it.`;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e));
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (e.key === 'Enter' && !e.shiftKey && target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      if (target.dataset.variableName !== undefined) {
        target.blur();
        return;
      }
      void save();
    }
  };

  const chosenCount = Object.keys(chosen).length;

  return (
    <ModalSurface
      open={open}
      onClose={close}
      align="top"
      surfaceSx={{ width: 720, maxWidth: 'calc(100vw - 32px)', p: 3 }}
      onKeyDown={onKeyDown}
      aria-labelledby="save-recipe-title"
    >
      <Typography id="save-recipe-title" variant="h6" component="h2" sx={{ color: 'var(--text-color)', fontWeight: 500 }}>
        Save as recipe
      </Typography>
      <Typography variant="body2" sx={{ color: 'var(--node-secondary-text-color)', mb: 2 }}>
        Only you can see it. Press Ctrl+O on any database to use it.
      </Typography>

      {!draft ? (
        <Typography variant="body2" sx={{ color: 'var(--text-color)' }}>
          There is no query here to save. Write one, then press Ctrl+S.
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <TextField
            label="Title"
            size="small"
            inputRef={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="What does this find?"
            inputProps={{ maxLength: 200 }}
          />
          <TextField
            label="Explanation"
            size="small"
            multiline
            minRows={2}
            value={explanation}
            onChange={e => setExplanation(e.target.value)}
            placeholder="What someone needs to know to trust the result"
          />
          <Box>
            <Typography variant="caption" sx={{ color: 'var(--node-secondary-text-color)' }}>
              Query
            </Typography>
            <Box
              sx={{
                fontFamily: 'var(--code-font)',
                fontSize: '0.9rem',
                lineHeight: 1.9,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                border: '1px solid var(--border-color)',
                borderRadius: 1,
                p: 1.5,
                color: 'var(--text-color)',
                maxHeight: 260,
                overflow: 'auto',
              }}
            >
              <QueryWithValues
                expression={draft.expression}
                literals={literals}
                chosen={chosen}
                onChoose={(i, name) => setChosen(c => ({ ...c, [i]: name }))}
                onUnchoose={i =>
                  setChosen(c => {
                    const next = { ...c };
                    delete next[i];
                    return next;
                  })
                }
              />
            </Box>
            <Typography variant="caption" component="p" sx={{ color: 'var(--node-secondary-text-color)', mt: 0.5 }}>
              {literals.length
                ? 'Click a value to make it a variable, filled in each time the recipe is used. Values you leave alone stay fixed.'
                : 'This query has no values to make into variables. It is saved as it is.'}
            </Typography>
          </Box>
          {draft.includedNames.length > 0 && (
            <Typography variant="body2" sx={{ color: 'var(--text-color)', borderLeft: '2px solid var(--primary-color)', pl: 1.5 }}>
              Also saves the block above that defines <strong>{draft.includedNames.join(', ')}</strong>, because this
              query uses it.
            </Typography>
          )}
          {error && (
            <Typography variant="body2" sx={{ color: 'var(--text-warning-color)' }}>
              {error}
            </Typography>
          )}
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 3 }}>
        <Typography variant="caption" sx={{ color: 'var(--node-secondary-text-color)', flex: 1 }}>
          {draft ? (chosenCount ? `${chosenCount} ${chosenCount === 1 ? 'variable' : 'variables'}` : 'No variables yet') : ''}
        </Typography>
        <Button onClick={close} sx={{ color: 'var(--text-color)' }}>
          Cancel
        </Button>
        <Button
          onClick={() => void save()}
          variant="contained"
          disabled={!draft || !title.trim() || saving}
          sx={{ bgcolor: 'var(--primary-color)', color: 'var(--primary-text-color)', '&:hover': { bgcolor: 'var(--primary-color-hover)' } }}
        >
          Save recipe
        </Button>
      </Box>
    </ModalSurface>
  );
});

/** The query, with each value as a button that turns it into a variable. */
const QueryWithValues = ({
  expression,
  literals,
  chosen,
  onChoose,
  onUnchoose,
}: {
  expression: string;
  literals: ReturnType<typeof findLiterals>;
  chosen: Record<number, string>;
  onChoose: (index: number, name: string) => void;
  onUnchoose: (index: number) => void;
}) => {
  const parts: React.ReactNode[] = [];
  let last = 0;
  literals.forEach((l, i) => {
    parts.push(expression.slice(last, l.start));
    last = l.end;
    const name = chosen[i];
    if (name === undefined) {
      parts.push(
        <Box
          key={i}
          component="button"
          type="button"
          title="Make this a variable"
          onClick={() => onChoose(i, l.suggestedName)}
          sx={{
            font: 'inherit',
            color: 'inherit',
            background: 'transparent',
            border: 0,
            borderBottom: '1.5px dashed var(--node-secondary-text-color)',
            borderRadius: '2px',
            px: '2px',
            cursor: 'pointer',
            '&:hover': { backgroundColor: 'var(--node-column-bg)' },
          }}
        >
          {l.raw}
        </Box>,
      );
    } else {
      parts.push(
        <Box
          key={i}
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'baseline',
            border: '1px solid var(--notification-color)',
            borderRadius: '5px',
            px: '4px',
          }}
        >
          <Box component="span" sx={{ color: 'var(--notification-color)' }}>
            $
          </Box>
          <Box
            component="input"
            data-variable-name=""
            aria-label={`Variable name for ${l.raw}`}
            value={name}
            size={Math.max(3, name.length)}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChoose(i, e.target.value)}
            sx={{ font: 'inherit', color: 'var(--text-color)', background: 'transparent', border: 0, p: 0, outline: 'none' }}
          />
          <Box
            component="button"
            type="button"
            aria-label={`Keep ${l.raw} fixed`}
            onClick={() => onUnchoose(i)}
            sx={{ font: 'inherit', color: 'var(--node-secondary-text-color)', background: 'transparent', border: 0, pl: '4px', cursor: 'pointer' }}
          >
            ×
          </Box>
        </Box>,
      );
    }
  });
  parts.push(expression.slice(last));
  return <>{parts}</>;
};

export default SaveRecipeModal;
