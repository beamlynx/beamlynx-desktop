import { observer } from 'mobx-react-lite';
import React, { useState } from 'react';
import type { CanvasStore } from '../../store/canvas/canvas.store';
import { displayValue } from '../../store/values-blocks';

/**
 * The tab's $variables, on the canvas: each name the query uses, with the
 * value its values block sets, or "no value". Clicking a value edits it in
 * place; Enter writes it into the text (a `$name = value` line, see
 * store/values-blocks.ts), so the Pine panel and the canvas never disagree.
 * The Pine panel needs nothing like this: there, the values block is the text.
 */
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
  const commit = (name: string) => {
    try {
      canvasStore.setVariableValue(name, draft, report.lists.includes(name));
      setEditing(null);
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
        maxWidth: 'min(320px, calc(100% - 16px))',
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
          <div key={name} style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
            <span style={{ color: 'var(--notification-color)' }}>${name}</span>
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
                  if (e.key === 'Escape') setEditing(null);
                }}
                onBlur={() => setEditing(null)}
                style={{
                  font: 'inherit',
                  color: 'var(--canvas-text)',
                  background: 'var(--canvas-bg)',
                  border: '1px solid var(--canvas-node-border-current)',
                  borderRadius: 4,
                  padding: '0 4px',
                  minWidth: 0,
                  flex: 1,
                }}
              />
            ) : (
              <button
                type="button"
                title="Set the value"
                onClick={() => start(name)}
                style={{
                  font: 'inherit',
                  background: 'transparent',
                  border: 0,
                  padding: 0,
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
