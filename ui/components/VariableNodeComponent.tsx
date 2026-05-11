import React from 'react';
import { Handle, NodeProps, Position } from 'reactflow';
import { VariableInnerTable, VariableNodeData } from '../model';

type Props = NodeProps<VariableNodeData>;

const handleStyle: React.CSSProperties = {
  width: '2px',
  height: '2px',
  background: 'var(--node-handle-bg)',
  borderRadius: '50%',
};

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

const VariableNodeComponent: React.FC<Props> = ({ data }) => {
  const { variableName, innerTables } = data;
  return (
    <div
      style={{
        border: '2px dashed var(--node-variable-border, #7c5cbf)',
        borderRadius: '8px',
        background: 'var(--node-variable-bg, rgba(124, 92, 191, 0.05))',
        minWidth: '188px',
      }}
    >
      <div
        style={{
          padding: '4px 10px 4px 10px',
          fontSize: '10px',
          fontFamily: 'Courier, monospace',
          color: 'var(--node-variable-label-color, #7c5cbf)',
          borderBottom: '1px dashed var(--node-variable-border, #7c5cbf)',
        }}
      >
        = {variableName}
      </div>
      <div style={{ paddingTop: '6px', paddingBottom: '2px' }}>
        {innerTables.map(t => (
          <InnerTableRow key={t.alias} {...t} />
        ))}
      </div>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
};

export default VariableNodeComponent;
