import { Box } from '@mui/material';
import { observer } from 'mobx-react-lite';
import React from 'react';
import { JsonPeek } from '../../store/canvas/json-peek';
import { prettyJson } from '../json-cell.util';

// A peek at a JSON column while a key inside it is typed, in a canvas picker
// or in the Pine panel with its hints open (store/canvas/json-peek.ts): the
// value, over the results pane, under the query that fetched it. The Pine
// panel keeps the tab's own query. The card doesn't take the focus: it stays
// where the key is typed.

const tagStyle: React.CSSProperties = {
  fontFamily: 'var(--canvas-font)',
  fontSize: 'calc(10px * var(--text-scale, 1))',
  fontWeight: 700,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: 'var(--primary-color)',
  border: '1px solid var(--primary-color)',
  borderRadius: 3,
  padding: '0 5px',
  flexShrink: 0,
};

const codeStyle: React.CSSProperties = {
  fontFamily: 'var(--code-font)',
  fontSize: 'calc(12px * var(--text-scale, 1))',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  margin: 0,
};

const PeekLine = ({ loading }: { loading: boolean }) => (
  // Keyed on loading, so the sweep runs once more when the value arrives.
  <div key={String(loading)} className="json-peek-line" data-loading={loading} />
);

/** The first value of the JSON column, and the query that fetched it, over the results pane. */
export const JsonPeekCard = observer(({ peek, onLeave }: { peek: JsonPeek | null; onLeave?: () => void }) => {
  if (!peek) return null;
  const name = peek.table ? `${peek.table}.${peek.column}` : peek.column;
  return (
    <Box
      data-json-peek
      // Focusable, so clicking it to scroll or select keeps the Pine panel's
      // peek open (PineInput's onBlur).
      tabIndex={-1}
      onBlur={e => {
        // Back to the Pine panel keeps the peek; anywhere else ends it.
        const to = e.relatedTarget as HTMLElement | null;
        if (!to?.closest('.cm-editor, [data-json-peek]')) onLeave?.();
      }}
      data-testid="json-peek-card"
      className="json-peek"
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--background-color)',
        border: '1px solid var(--border-color)',
        borderRadius: 1,
        overflow: 'hidden',
        outline: 'none',
        color: 'var(--text-color)',
      }}
    >
      <PeekLine loading={peek.status === 'loading'} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, pt: 1, pb: 0.5 }}>
        <span style={tagStyle}>peek</span>
        <span style={{ fontFamily: 'var(--canvas-font)', color: 'var(--canvas-text-dim)' }}>
          The first value of <code style={{ fontFamily: 'var(--code-font)' }}>{name}</code>, to see its keys
        </span>
      </Box>
      <Box sx={{ px: 1.5, pb: 0.5, color: 'var(--canvas-text-dim)' }}>
        <pre data-testid="json-peek-card-query" style={{ ...codeStyle, fontSize: 'calc(11px * var(--text-scale, 1))' }}>
          {peek.expression}
        </pre>
      </Box>
      <Box className="styled-scrollbar" sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.5, py: 1 }}>
        {peek.status === 'loading' && <span style={{ opacity: 0.6 }}>loading…</span>}
        {peek.status === 'empty' && (
          <span style={{ opacity: 0.7 }}>
            No row has a value in <code>{name}</code>.
          </span>
        )}
        {peek.status === 'error' && <span style={{ color: 'var(--canvas-warn)' }}>{peek.error}</span>}
        {peek.status === 'found' && (
          <pre data-testid="json-peek-value" style={codeStyle}>
            {typeof peek.value === 'string' ? peek.value : prettyJson(peek.value)}
          </pre>
        )}
      </Box>
    </Box>
  );
});
