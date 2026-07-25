import React from 'react';
import { Handle, NodeProps, Position } from 'reactflow';
import { SuggestedNodeData } from '../model';
import { Session } from '../store/session';
import { useStores } from '../store/store-container';

const handleStyle: React.CSSProperties = {
  width: '2px',
  height: '2px',
  background: 'darkgray',
  borderRadius: '50%',
};

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
        padding: '12px 10px 12px 10px',
        border,
        background,
        borderRadius: '5px',
        color: textColor,
      }}
    >
      <div>{isVariable ? `= ${data.table}` : data.table}</div>
      {data.column && (
        <div
          title={data.column}
          style={{
            fontSize: '8px',
            fontFamily: 'Courier, monospace',
            // --node-secondary-text-color is a muted gray tuned for contrast
            // against the normal suggested background - against the bright
            // candidate background it's nearly illegible, so match the
            // primary text color (already candidate-aware) there instead.
            color: candidate ? textColor : 'var(--node-secondary-text-color)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
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
      {/* A suggested node has exactly one real relation - to context - and it
          only ever attaches on one side: a child suggestion (data.parent
          false) receives the edge on its left, a parent suggestion attaches
          from its right. Rendering the other side's handle unconditionally
          suggested a connection that doesn't exist. */}
      {!data.parent && <Handle type="target" position={Position.Left} style={handleStyle} />}
      {data.parent && <Handle type="source" position={Position.Right} style={handleStyle} />}
    </div>
  );
};

export default SuggestedNodeComponent;
