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
 * Renders one handle per relation on a node's side. With a single relation,
 * this stays pixel-identical to a plain centered anonymous handle (no
 * label) — the common case is unaffected. With more than one, handles are
 * laid out below the node's header (`headerOffset`, tailored per node type)
 * and each gets a small, truncated column label so multiple FK relations to
 * the same or different tables are visually distinguishable.
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
  if (handles.length === 1) {
    return <Handle type={type} position={position} id={handles[0].id} style={handleDotStyle} />;
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
                  transform: 'translateY(-50%)',
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
