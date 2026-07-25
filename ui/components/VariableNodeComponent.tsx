import React, { useEffect, useState } from 'react';
import { NodeProps, Position, useUpdateNodeInternals } from 'reactflow';
import { VariableInnerTable, VariableNodeData } from '../model';
import { getVariableNodeHeight, variableNodeHeaderHeight } from '../store/node-layout';
import { RelationHandles, handleLabelInset } from './RelationHandles';

type Props = NodeProps<VariableNodeData>;

const nodeContentWidth = 188;
const handleLabelMaxWidth = nodeContentWidth - handleLabelInset * 2;

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
    }}
  >
    <span>{table}</span>
    <span
      style={{
        marginLeft: '6px',
        fontSize: '8px',
        fontFamily: 'Courier, monospace',
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
  const { variableName, innerTables, leftHandles, rightHandles } = data;
  const [expanded, setExpanded] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  const handleKey = [...leftHandles, ...rightHandles].map(h => h.id).join(',');
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, handleKey, updateNodeInternals]);

  return (
    <div
      style={{
        position: 'relative',
        border: '2px dashed var(--node-variable-border, #7c5cbf)',
        borderRadius: '8px',
        background: 'var(--node-variable-bg, rgba(124, 92, 191, 0.05))',
        minWidth: `${nodeContentWidth}px`,
        minHeight: getVariableNodeHeight(leftHandles.length, rightHandles.length),
      }}
    >
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: '4px 8px 4px 10px',
          fontSize: '10px',
          fontFamily: 'Courier, monospace',
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
        <div style={{ paddingTop: '6px', paddingBottom: '2px' }}>
          {innerTables.map(t => (
            <InnerTableRow key={t.alias} {...t} />
          ))}
        </div>
      )}
      <RelationHandles
        handles={leftHandles}
        type="target"
        position={Position.Left}
        headerOffset={variableNodeHeaderHeight}
        maxLabelWidth={handleLabelMaxWidth}
      />
      <RelationHandles
        handles={rightHandles}
        type="source"
        position={Position.Right}
        headerOffset={variableNodeHeaderHeight}
        maxLabelWidth={handleLabelMaxWidth}
      />
    </div>
  );
};

export default VariableNodeComponent;
