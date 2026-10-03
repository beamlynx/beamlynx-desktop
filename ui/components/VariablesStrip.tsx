import { Box, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import React from 'react';
import type { Session } from '../store/session';

/**
 * A field for each $variable the tab's query uses (pine-lang's
 * docs/variables.md), shown above the tab while there are any. What's typed is
 * kept per tab and sent with every run, so rerunning for another company is a
 * change to one field, not to the query. A variable used with `in` takes a
 * comma-separated list. An empty field is outlined: running would stop and
 * name it.
 */
const VariablesStrip = observer(({ session }: { session: Session }) => {
  const report = session.variablesReport;
  if (!report || report.used.length === 0 || session.inputMode !== 'pine') return null;

  const dim = 'var(--node-secondary-text-color)';
  return (
    <Box
      role="group"
      aria-label="Variables"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 2,
        rowGap: 1,
        px: 1.5,
        py: 0.75,
        mb: 1,
        border: '1px solid var(--border-color)',
        borderRadius: 1,
        backgroundColor: 'var(--node-column-bg)',
      }}
    >
      <Typography variant="body2" sx={{ color: dim }}>
        Variables
      </Typography>
      {report.used.map(name => {
        const list = report.lists.includes(name);
        const value = session.variableValues[name] ?? '';
        const missing = value.trim() === '';
        return (
          <Box key={name} component="label" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            <Typography component="span" sx={{ fontFamily: 'var(--code-font)', fontSize: '0.85rem', color: 'var(--notification-color)' }}>
              ${name}
            </Typography>
            <Box
              component="input"
              aria-label={list ? `Values for $${name}, comma-separated` : `Value for $${name}`}
              placeholder={list ? 'a, b, c' : 'value'}
              value={value}
              size={Math.min(40, Math.max(8, value.length + 1))}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => session.setVariableValue(name, e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => {
                // Enter runs, like Ctrl+Enter, so trying another value is a
                // change and a keypress.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void session.evaluate();
                }
              }}
              sx={{
                fontFamily: 'var(--code-font)',
                fontSize: '0.85rem',
                color: 'var(--text-color)',
                backgroundColor: 'var(--background-color)',
                border: '1px solid',
                borderColor: missing ? 'var(--notification-color)' : 'var(--border-color)',
                borderRadius: 1,
                px: 0.75,
                py: 0.25,
                outline: 'none',
                '&:focus': { borderColor: 'var(--focus-border-color)' },
              }}
            />
            {list && (
              <Typography component="span" variant="caption" sx={{ color: dim }}>
                comma-separated
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
});

export default VariablesStrip;
