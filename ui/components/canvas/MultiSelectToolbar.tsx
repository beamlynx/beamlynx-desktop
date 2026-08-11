import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { CanvasStore } from '../../store/canvas/canvas.store';

const toolbarButtonStyle: React.CSSProperties = {
  fontSize: '11px',
  fontFamily: 'var(--canvas-font)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  padding: '4px 10px',
  borderRadius: 3,
  cursor: 'pointer',
  color: 'var(--canvas-trace)',
  border: '1px solid var(--canvas-trace)',
  background: 'var(--canvas-node-bg)',
  whiteSpace: 'nowrap',
};

const disabledButtonStyle: React.CSSProperties = {
  ...toolbarButtonStyle,
  cursor: 'not-allowed',
  color: 'var(--canvas-text-dim)',
  border: '1px solid var(--canvas-chip-border)',
  opacity: 0.6,
};

/**
 * Appears once 2+ nodes are box/shift-selected (see Canvas.tsx's
 * onSelectionChange). `limit` is fully wired - a pipeline-wide `limit: N`,
 * unrelated to which specific nodes are selected. `assign` and `group`
 * are shown per the requested design but not yet wired to a mutation:
 * `group:` naturally lives on one table's context, and `assign` implies
 * pine's `|=` variable/checkpoint syntax, which needs multi-block support
 * canvas mode doesn't have yet (see the plan doc's scope boundaries) - both
 * need a decision on exact semantics before they do anything real, rather
 * than guessing and shipping the wrong gesture.
 */
const MultiSelectToolbar: React.FC<{ canvasStore: CanvasStore }> = observer(({ canvasStore }) => {
  const [limitOpen, setLimitOpen] = useState(false);
  const [limitValue, setLimitValue] = useState('');
  const count = canvasStore.selectedAliases.length;

  if (count < 2) return null;

  const submitLimit = () => {
    const n = parseInt(limitValue, 10);
    if (Number.isFinite(n) && n > 0) void canvasStore.commitLimit(n);
    setLimitOpen(false);
    setLimitValue('');
  };

  return (
    <div
      className="nodrag"
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 15,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
        borderRadius: 4,
        background: 'var(--canvas-node-bg)',
        border: '1px solid var(--canvas-node-border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      <span style={{ fontSize: '11px', fontFamily: 'var(--canvas-font)', color: 'var(--canvas-text-dim)' }}>
        {count} selected
      </span>
      <span title="Not implemented yet" style={disabledButtonStyle}>
        assign
      </span>
      {limitOpen ? (
        <span style={{ display: 'flex', gap: 4 }}>
          <input
            autoFocus
            type="number"
            min={1}
            value={limitValue}
            onChange={e => setLimitValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitLimit();
              if (e.key === 'Escape') setLimitOpen(false);
            }}
            style={{ width: 60, fontFamily: 'inherit', fontSize: 'inherit' }}
          />
          <span style={{ ...toolbarButtonStyle, padding: '2px 6px' }} onClick={submitLimit}>
            set
          </span>
        </span>
      ) : (
        <span data-testid="multiselect-limit" style={toolbarButtonStyle} onClick={() => setLimitOpen(true)}>
          limit
        </span>
      )}
      <span title="Not implemented yet" style={disabledButtonStyle}>
        group
      </span>
    </div>
  );
});

export default MultiSelectToolbar;
