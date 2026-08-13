import React from 'react';
import { Handle, NodeProps, Position } from 'reactflow';
import { SuggestedNodeData } from '../model';
import { Session } from '../store/session';
import { useStores } from '../store/store-container';
import {
  getSuggestedNodeHeight,
  handleRowHeight,
  nodeWidth,
  suggestedNodeHeaderHeight,
} from '../store/node-layout';
import { handleLabelInset } from './RelationHandles';

const handleStyle: React.CSSProperties = {
  width: '2px',
  height: '2px',
  background: 'var(--node-handle-bg)',
  borderRadius: 0,
};

// Row 0's vertical center below the header - the only row a suggested node
// ever has, so both its handle and column label anchor here (see
// RelationHandles, which uses the same headerHeight + 0.5*rowHeight math for
// a selected/variable node's rows).
const columnRowTop = suggestedNodeHeaderHeight + 0.5 * handleRowHeight;
const columnLabelMaxWidth = nodeWidth - handleLabelInset * 2;

type PineNodeProps = NodeProps<SuggestedNodeData>;

const onSuggestedNodeClick = async (session: Session, pine: string) => {
  await session.pipeAndUpdateExpression(pine, true);
};

const SuggestedNodeComponent: React.FC<PineNodeProps> = ({ data }) => {
  const { global } = useStores();
  const session = global.getSession(data.sessionId);
  const candidate = data.type === 'candidate';
  // A suggested variable/checkpoint reference (schema is null - see TableHint
  // in client.ts) gets the same dashed-border container look as the real
  // checkpoint node it would become once piped in, instead of looking like a
  // plain table suggestion.
  const isVariable = data.schema === null;
  const background = candidate ? 'var(--node-candidate-bg)' : 'var(--node-suggested-bg)';
  const border = isVariable
    ? '2px dashed var(--node-variable-border, #7c5cbf)'
    : candidate
      ? `2px solid var(--node-candidate-border)`
      : `2px solid var(--node-suggested-border)`;
  const textColor = isVariable
    ? 'var(--node-variable-label-color, #7c5cbf)'
    : candidate
      ? 'var(--node-candidate-text-color)'
      : 'var(--node-text-color)';

  return (
    <div
      // globals.css forces a solid border (!important) on suggested-node's
      // direct div children; the variable class there overrides it back to
      // dashed with higher selector specificity.
      className={isVariable ? 'suggested-node-variable' : undefined}
      onClick={() => onSuggestedNodeClick(session, data.pine)}
      style={{
        cursor: 'pointer',
        position: 'relative',
        boxSizing: 'border-box',
        width: nodeWidth,
        minHeight: getSuggestedNodeHeight(!!data.column),
        padding: '12px 10px 12px 10px',
        border,
        background,
        borderRadius: '5px',
        color: textColor,
        fontFamily: 'var(--canvas-font)',
      }}
    >
      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {isVariable ? `= ${data.table}` : data.table}
      </div>
      {data.column && (
        <div
          title={data.column}
          style={{
            position: 'absolute',
            top: columnRowTop,
            // Matches RelationHandles' own centering fix: these short,
            // descender-less labels render high within their line box
            // regardless of line-height, so nudge down to meet the dot.
            lineHeight: 1,
            transform: 'translateY(calc(-50% + 2px))',
            maxWidth: columnLabelMaxWidth,
            fontSize: '7px',
            fontFamily: 'var(--canvas-font)',
            // --node-secondary-text-color is a muted gray tuned for contrast
            // against the normal suggested background - against the bright
            // candidate background it's nearly illegible, so match the
            // primary text color (already candidate-aware) there instead.
            color: candidate ? textColor : 'var(--node-secondary-text-color)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            pointerEvents: 'none',
            ...(data.parent ? { right: handleLabelInset } : { left: handleLabelInset }),
          }}
        >
          {data.column}
        </div>
      )}
      {data.schema && data.schema !== 'public' && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: -5, // Position above the node
            padding: '2px 5px',
            fontSize: '8px', // Smaller font size
            background: data.color ?? 'var(--node-schema-bg)', // Different colors for selected and suggested
            borderRadius: '5px', // Rounded corners for the schema label
            transform: 'translateY(-100%)', // Move up fully above the node
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)', // Optional: adds shadow for better visibility
            color: data.color ? '#000000' : 'var(--node-schema-text-color)', // Use dark text on bright colors
          }}
        >
          {data.schema}
        </div>
      )}
      {/* A suggested node has at most one real relation - to context - and it
          only ever attaches on one side: a child suggestion (data.parent
          false) receives the edge on its left, a parent suggestion attaches
          from its right. `parent` is entirely absent (not false) on a
          no-context hint - the very first table typed, with no relation to
          anything yet - so that case renders neither handle; checking
          `!data.parent` here would treat undefined the same as false and
          show a left handle for a relation that doesn't exist.
          Positioned at the same columnRowTop as the column label above -
          without this it falls back to React Flow's default vertical
          center, which doesn't line up with the label once the node grows
          taller than its old single-line-only height. */}
      {data.parent === false && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ ...handleStyle, top: columnRowTop }}
        />
      )}
      {data.parent === true && (
        <Handle
          type="source"
          position={Position.Right}
          style={{ ...handleStyle, top: columnRowTop }}
        />
      )}
    </div>
  );
};

export default SuggestedNodeComponent;
