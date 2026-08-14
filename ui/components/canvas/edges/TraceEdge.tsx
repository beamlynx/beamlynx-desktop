import React from 'react';
import { EdgeProps, getSmoothStepPath } from 'reactflow';

// Deterministic small lateral nudge for this edge's own elbow, derived from
// its id - not from index/position in an array, which shifts every edge's
// lane around on every add/remove instead of just the affected ones. Two
// unrelated joins that would otherwise route through the exact same
// intermediate corridor (e.g. two children fanning out from one parent's
// single pin - the straight-line routing that made this necessary in the
// first place) become distinguishable parallel traces instead of one
// visually-coincident line, the same way real board traces run in adjacent
// channels rather than literally on top of each other.
const laneOffset = (id: string): number => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 5) * 6 - 12; // -12, -6, 0, 6, 12
};

const TraceEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}) => {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 0,
    offset: 16,
    centerX: (sourceX + targetX) / 2 + laneOffset(id),
  });
  return (
    <path id={id} className="react-flow__edge-path" d={path} style={style} markerEnd={markerEnd} />
  );
};

export default TraceEdge;
