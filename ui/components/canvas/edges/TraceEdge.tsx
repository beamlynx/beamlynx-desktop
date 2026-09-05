import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from 'reactflow';
import { JoinType } from '../../../store/canvas/canvas.model';
import { useCanvasStore } from '../canvas-context';

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

type TraceEdgeData = { joinType?: 'LEFT' | 'RIGHT' | null; joinTargetAlias?: string };

/**
 * The classic two-circle "which side is kept" Venn glyph SQL join diagrams
 * always use - inner shades only the overlap, left/right shades one whole
 * circle (that side's rows are all kept) plus the overlap, the other circle
 * left as an outline (only its matching rows are real). Shape alone
 * disambiguates the three types with no text, at a size a "LEFT"/"RIGHT"
 * word label can't read at cleanly. `clipId` must be unique per rendered
 * icon (SVG ids are document-global, not scoped to their own `<svg>`) - the
 * edge's own id, already unique, does the job with no extra bookkeeping.
 */
const JoinVennIcon = ({ type, clipId }: { type: JoinType; clipId: string }) => (
  <svg width={16} height={14} viewBox="0 0 16 14" aria-hidden focusable={false}>
    <defs>
      <clipPath id={clipId}>
        <circle cx={10} cy={7} r={5} />
      </clipPath>
    </defs>
    {type === 'inner' && <circle cx={6} cy={7} r={5} fill="currentColor" clipPath={`url(#${clipId})`} />}
    <circle cx={6} cy={7} r={5} fill={type === 'left' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1} />
    <circle cx={10} cy={7} r={5} fill={type === 'right' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1} />
  </svg>
);

const TraceEdge: React.FC<EdgeProps<TraceEdgeData>> = observer(
  ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }) => {
    const store = useCanvasStore();
    const [hovered, setHovered] = useState(false);
    const bendX = (sourceX + targetX) / 2 + laneOffset(id);
    const [path] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 0,
      offset: 16,
      centerX: bendX,
    });

    const joinTargetAlias = data?.joinTargetAlias;
    const joinType: JoinType = data?.joinType === 'LEFT' ? 'left' : data?.joinType === 'RIGHT' ? 'right' : 'inner';

    // This step path has exactly two right-angle corners, both at `bendX`:
    // one at sourceY, one at targetY. Anchoring at whichever one is
    // adjacent to the target (as this used to) flips which of the two
    // corners gets used depending on whether the target renders below or
    // above the source - "belongs to" relations can put the FK's parent
    // table to the LEFT (confirmed live: `tenant | company | tenant` - the
    // second tenant renders left of company too, same as the first, so
    // that edge runs backwards relative to the first one). Different edges
    // ending up anchored at DIFFERENT corner shapes is what actually caused
    // overlap, not which specific corner it was. Always taking the lower of
    // the two corners (`Math.max`) - regardless of whether that happens to
    // sit next to the source or the target this time - keeps every edge's
    // icon on the same consistent corner shape.
    const iconX = bendX;
    const iconY = Math.max(sourceY, targetY);

    // Whether Shift+J/Shift+K (CanvasStore.configNext/configPrev) has
    // this edge's own join-type highlighted right now - see TableNode.tsx's
    // matching check for its where chips. Both read the same
    // focusedConfigItem so keyboard and mouse land on identical highlight
    // state regardless of which one moved the cursor there.
    const isCursorTarget =
      !!joinTargetAlias && store.focusedAlias === joinTargetAlias && store.focusedConfigItem?.kind === 'join-type';

    return (
      <>
        <path id={id} className="react-flow__edge-path" d={path} style={style} markerEnd={markerEnd} />
        {joinTargetAlias && (
          <EdgeLabelRenderer>
            {/* The icon itself is a compact ~16x14 glyph - a real click/hover
                target needs more room than that (at minZoom 0.5 it's an
                ~8x7 target), so this outer div is the hit area (and hover
                surface), sized independently of how the icon looks. */}
            <div
              className="nodrag nopan picker-trigger"
              data-testid={`join-type-icon-${joinTargetAlias}`}
              title={`Join: ${joinType[0].toUpperCase()}${joinType.slice(1)} - click to change`}
              onClick={e => {
                e.stopPropagation();
                store.openJoinTypePicker(joinTargetAlias, joinType, { x: e.clientX, y: e.clientY });
              }}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${iconX}px, ${iconY}px)`,
                width: 22,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                // The keyboard config cursor (see CanvasStore.flatStops)
                // gets the same halo TableNode's own chips use for the same
                // state - this is the one place that halo needs its own
                // background rather than reusing a chip's existing border,
                // since the icon has no chip/border shape of its own to
                // recolor.
                background: isCursorTarget ? 'var(--canvas-chip-bg)' : 'transparent',
                boxShadow: isCursorTarget ? '0 0 0 1px var(--canvas-node-border-current)' : undefined,
                pointerEvents: 'all',
                cursor: 'pointer',
                // The accent lives here now, not on the edge line itself
                // (Canvas.tsx's own comment on `edges` - a plain resolved
                // join is deliberately neutral) - a small glyph carrying the
                // accent reads as a deliberate touch rather than the "busy"
                // a whole accent-colored line across the canvas would; full
                // contrast on hover/cursor-target still marks "actively
                // interacting with this," the same distinction the old
                // dim/bright pair made, just with a different rest color.
                color: hovered || isCursorTarget ? 'var(--canvas-text)' : 'var(--canvas-trace)',
                transition: 'color 0.1s ease-in-out',
              }}
            >
              <JoinVennIcon type={joinType} clipId={`join-venn-clip-${id}`} />
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  },
);

export default TraceEdge;
