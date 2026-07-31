import React from 'react';
import { Handle, Position } from 'reactflow';
import { NodeHandle } from '../model';
import { handleRowHeight } from '../store/node-layout';

const handleDotStyle: React.CSSProperties = {
  width: '2px',
  height: '2px',
  background: 'var(--node-handle-bg)',
  borderRadius: '50%',
};

export const handleLabelInset = 8;

/**
 * A single handle whose column is genuinely unknown (the backend never
 * exposes it — see the collapsed-suggested-parent-handle case in
 * graph.util.ts) has nothing to label, so it stays a plain anonymous dot.
 * Every other case — including a single handle with a known column — shows
 * its label, since a lone dot can be any column and shouldn't be left
 * unidentified.
 */
export const needsHandleRows = (handles: NodeHandle[]): boolean =>
  handles.length > 1 || (handles.length === 1 && handles[0].column !== '');

/**
 * Renders one handle per relation on a node's side, laid out below the
 * node's header (`headerOffset`, tailored per node type) with a small,
 * truncated column label each, so relations are visually identifiable and
 * distinguishable from one another.
 */
export const RelationHandles = ({
  handles,
  type,
  position,
  headerOffset,
  maxLabelWidth,
}: {
  handles: NodeHandle[];
  type: 'target' | 'source';
  position: Position;
  headerOffset: number;
  maxLabelWidth: number;
}) => {
  if (handles.length === 0) return null;
  if (!needsHandleRows(handles)) {
    // Row 0's position, same as the labeled case below - without this, the
    // dot falls back to React Flow's default vertical-center-of-node
    // placement, which doesn't line up with the OTHER side's handles when
    // that side does have labeled rows (the node's height, and so its true
    // center, grows to fit them).
    const top = headerOffset + 0.5 * handleRowHeight;
    return <Handle type={type} position={position} id={handles[0].id} style={{ ...handleDotStyle, top }} />;
  }
  const sideStyle: React.CSSProperties =
    position === Position.Left ? { left: handleLabelInset } : { right: handleLabelInset };
  return (
    <>
      {handles.map((h, i) => {
        const top = headerOffset + (i + 0.5) * handleRowHeight;
        return (
          <React.Fragment key={h.id}>
            <Handle type={type} position={position} id={h.id} style={{ ...handleDotStyle, top }} />
            {h.column && (
              <div
                title={h.column}
                style={{
                  position: 'absolute',
                  top,
                  // A tight line-height limits font-metric leading, but the
                  // glyphs themselves (no descenders in these labels) still
                  // render high within even a 1-line-height box - nudge the
                  // box down a couple px so the visible ink lines up with
                  // the dot instead of just the (empty-looking) box center.
                  lineHeight: 1,
                  transform: 'translateY(calc(-50% + 2px))',
                  maxWidth: maxLabelWidth,
                  fontSize: '7px',
                  fontFamily: 'Courier, monospace',
                  color: 'var(--node-secondary-text-color)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  pointerEvents: 'none',
                  ...sideStyle,
                }}
              >
                {h.column}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};
