import React, { useEffect, useState } from 'react';
import { NodeProps, Position, useUpdateNodeInternals } from 'reactflow';
import { VariableInnerTable, VariableNodeData } from '../model';
import { effectiveHandleCount, getVariableNodeHeight, variableNodeHeaderHeight } from '../store/node-layout';
import { RelationHandles, handleLabelInset } from './RelationHandles';

type Props = NodeProps<VariableNodeData>;

const nodeContentWidth = 188;
const handleLabelMaxWidth = nodeContentWidth - handleLabelInset * 2;

// Approximate rendered height of one InnerTableRow (padding + margin-bottom +
// border + content line), plus the expanded list's own top/bottom padding —
// used so relation handles/labels are pushed below the expanded table list
// instead of overlapping it (see innerTablesListStyle/InnerTableRow below).
const innerTableRowHeight = 36;
const innerTablesListPadding = 8;

const innerTablesListStyle: React.CSSProperties = { paddingTop: '6px', paddingBottom: '2px' };

const InnerTableRow = ({ table, schema, alias, color }: VariableInnerTable) => (
  <div
    style={{
      position: 'relative',
      padding: '6px 10px',
      margin: '0 8px 6px 8px',
      border: '1px solid var(--node-border)',
      background: 'var(--node-bg)',
      borderRadius: '4px',
      color: 'var(--node-text-color)',
      fontSize: '12px',
      fontFamily: 'var(--canvas-font)',
    }}
  >
    <span>{table}</span>
    <span
      style={{
        marginLeft: '6px',
        fontSize: '8px',
        fontFamily: 'var(--canvas-font)',
        color: 'var(--node-secondary-text-color)',
      }}
    >
      {alias}
    </span>
    {schema && schema !== 'public' && (
      <span
        style={{
          position: 'absolute',
          right: 4,
          top: -8,
          padding: '1px 4px',
          fontSize: '8px',
          borderRadius: '4px',
          background: color || 'var(--node-schema-bg)',
          color: color ? '#000' : 'var(--node-schema-text-color)',
        }}
      >
        {schema}
      </span>
    )}
  </div>
);

const VariableNodeComponent: React.FC<Props> = ({ id, data }) => {
  const { variableName, innerTables, order, leftHandles, rightHandles } = data;
  const [expanded, setExpanded] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  const handleKey = [...leftHandles, ...rightHandles].map(h => h.id).join(',');
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, handleKey, expanded, updateNodeInternals]);

  // Expanding reveals the inner-table list between the header and the
  // handles — push the handles/labels down by that same amount so they
  // don't render on top of it.
  const expandedTablesHeight = expanded ? innerTablesListPadding + innerTables.length * innerTableRowHeight : 0;
  const handleOffset = variableNodeHeaderHeight + expandedTablesHeight;

  return (
    <div
      style={{
        position: 'relative',
        border: '2px dashed var(--node-variable-border, #7c5cbf)',
        borderRadius: '8px',
        background: 'var(--node-variable-bg, rgba(124, 92, 191, 0.05))',
        minWidth: `${nodeContentWidth}px`,
        minHeight:
          getVariableNodeHeight(effectiveHandleCount(leftHandles), effectiveHandleCount(rightHandles)) +
          expandedTablesHeight,
      }}
    >
      {/* Order - same badge/position as SelectedNodeComponent's; a
          container replaces one of the pipeline's selected-tables entries
          rather than adding a new one, so it takes over that entry's
          position number. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: 'translate(-50%, -50%)',
          width: '20px',
          height: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          background: 'var(--node-order-bg)',
          color: 'var(--node-order-text-color)',
          fontSize: '12px',
          fontFamily: 'var(--canvas-font)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
          fontWeight: 'bold',
        }}
      >
        {order}
      </div>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: '4px 8px 4px 10px',
          fontSize: '10px',
          fontFamily: 'var(--canvas-font)',
          color: 'var(--node-variable-label-color, #7c5cbf)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          userSelect: 'none',
        }}
      >
        <span>= {variableName}</span>
        <span style={{ fontSize: '8px', opacity: 0.7, marginLeft: 6 }}>
          {expanded ? '▼' : '▶'}
        </span>
      </div>
      {expanded && (
        <div style={innerTablesListStyle}>
          {innerTables.map(t => (
            <InnerTableRow key={t.alias} {...t} />
          ))}
        </div>
      )}
      <RelationHandles
        handles={leftHandles}
        type="target"
        position={Position.Left}
        headerOffset={handleOffset}
        maxLabelWidth={handleLabelMaxWidth}
      />
      <RelationHandles
        handles={rightHandles}
        type="source"
        position={Position.Right}
        headerOffset={handleOffset}
        maxLabelWidth={handleLabelMaxWidth}
      />
    </div>
  );
};

export default VariableNodeComponent;
