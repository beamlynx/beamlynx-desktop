import { observer } from 'mobx-react-lite';
import React, { useState } from 'react';
import type { CanvasStore } from '../../store/canvas/canvas.store';
import { displayValue, isStringValue } from '../../store/values-blocks';

/**
 * The tab's $variables, on the canvas: each name the query uses, with the
 * value its values block sets, or "no value". Clicking a value edits it in
 * place; Enter writes it into the text (a `$name = value` line, see
 * store/values-blocks.ts), so the Pine panel and the canvas never disagree.
 * The Pine panel needs nothing like this: there, the values block is the text.
 *
 * The list is as wide as its values. A value and its edit box have the same
 * width, border and padding (`valueBox`), so clicking a value doesn't resize
 * or shift anything. Only typing a longer value widens it.
 */
// A value is as wide as its text, in the monospace code font, with room for
// "no value" and the caret.
const valueBox = (text: string): React.CSSProperties => ({
  font: 'inherit',
  lineHeight: 1.5,
  height: '1.5em',
  boxSizing: 'content-box',
  border: '1px solid transparent',
  borderRadius: 4,
  padding: '0 4px',
  margin: 0,
  width: `${Math.max(text.length, 'no value'.length) + 1}ch`,
  maxWidth: '32ch',
  flex: 'none',
});

const CanvasVariables = observer(({ canvasStore }: { canvasStore: CanvasStore }) => {
  const report = canvasStore.session.variablesReport;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  if (!report || report.used.length === 0 || !canvasStore.canvasGraph.singleBlock) return null;

  const start = (name: string) => {
    setEditing(name);
    setDraft(displayValue(report.values?.[name]));
    setError('');
  };
  const stop = () => {
    setEditing(null);
    setError('');
  };
  const commit = (name: string) => {
    const current = report.values?.[name];
    // Unchanged: write nothing. Writing it back could change its type, or
    // round a large number that only survives as text.
    if (report.values && name in report.values && draft.trim() === displayValue(current)) {
      stop();
      return;
    }
    try {
      canvasStore.setVariableValue(name, draft, report.lists.includes(name), { string: isStringValue(current) });
      stop();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div
      role="group"
      aria-label="Variables"
      style={{
        position: 'absolute',
        top: 48,
        right: 8,
        zIndex: 14,
        maxWidth: 'calc(100% - 16px)',
        boxSizing: 'border-box',
        background: 'var(--canvas-node-bg)',
        border: '1px solid var(--canvas-node-border)',
        borderRadius: 6,
        padding: '6px 10px',
        display: 'grid',
        gap: 4,
        fontFamily: 'var(--code-font)',
        fontSize: '0.8rem',
        color: 'var(--canvas-text)',
      }}
    >
      {report.used.map(name => {
        const list = report.lists.includes(name);
        const has = report.values && name in report.values;
        return (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ color: 'var(--notification-color)', flexShrink: 0 }}>${name}</span>
            <span style={{ color: 'var(--canvas-text-dim)' }}>=</span>
            {editing === name ? (
              <input
                autoFocus
                aria-label={list ? `Values for $${name}, comma-separated` : `Value for $${name}`}
                placeholder={list ? 'a, b, c' : 'value'}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') commit(name);
                  if (e.key === 'Escape') stop();
                }}
                onBlur={stop}
                size={1}
                style={{
                  ...valueBox(draft),
                  color: 'var(--canvas-text)',
                  background: 'var(--canvas-bg)',
                  borderColor: 'var(--canvas-node-border-current)',
                }}
              />
            ) : (
              <button
                type="button"
                title="Set the value"
                onClick={() => start(name)}
                style={{
                  ...valueBox(has ? displayValue(report.values?.[name]) : ''),
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: has ? 'var(--canvas-text)' : 'var(--notification-color)',
                  fontStyle: has ? 'normal' : 'italic',
                }}
              >
                {has ? displayValue(report.values?.[name]) : 'no value'}
              </button>
            )}
          </div>
        );
      })}
      {error && <div style={{ color: 'var(--canvas-warn)', fontFamily: 'var(--canvas-font)' }}>{error}</div>}
    </div>
  );
});

export default CanvasVariables;
