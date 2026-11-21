import React from 'react';
import { EdgeLabelRenderer, EdgeProps, getBezierPath } from 'reactflow';

const colour = 'var(--canvas-container-border)';
const arrow = 6;

/**
 * An arrow of the lineage strip (see layout.ts's layoutLineage): the block
 * on the left is what the block on the right is made from. A dashed curve
 * with an arrowhead, in the nested-query colour, so it never reads as a
 * join's square trace. `in` on it says the block is used as a set, in
 * `where: x in name`.
 *
 * The arrowhead is drawn here rather than as an SVG marker: a marker's id
 * is built from its colour, and a CSS variable makes a broken id.
 */
const LineageEdge: React.FC<EdgeProps<{ use?: 'table' | 'in' }>> = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}) => {
  const tipX = targetX - 1;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX: tipX - arrow,
    targetY,
    targetPosition,
  });
  return (
    <>
      {/* Colours in style, not attributes: a CSS variable only resolves there. */}
      <path d={path} fill="none" strokeWidth={1.5} strokeDasharray="5 4" style={{ stroke: colour }} />
      <path
        d={`M ${tipX - arrow} ${targetY - arrow / 1.5} L ${tipX} ${targetY} L ${tipX - arrow} ${targetY + arrow / 1.5} Z`}
        stroke="none"
        style={{ fill: colour }}
      />
      {data?.use === 'in' && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              padding: '0 3px',
              background: 'var(--canvas-bg)',
              color: 'var(--canvas-text-dim)',
              fontFamily: 'var(--canvas-font)',
              fontSize: 'calc(10px * var(--text-scale, 1))',
              pointerEvents: 'none',
            }}
          >
            in
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default LineageEdge;
