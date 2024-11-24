import React from 'react';
import { Handle, NodeProps, Position } from 'reactflow';
import { SuggestedNodeData } from '../model';

const handleStyle: React.CSSProperties = {
  width: '2px',
  height: '2px',
  background: 'darkgray',
  borderRadius: '50%',
};

type PineNodeProps = NodeProps<SuggestedNodeData>;

const SuggestedNodeComponent: React.FC<PineNodeProps> = ({ data }) => {
  const lightOrange = '#FFD700';
  const candidate = data.type === 'candidate';
  const background = candidate ? lightOrange : 'white';
  const border = candidate ? `2px solid orange` : `2px solid orange`;

  return (
    <div
      style={{
        position: 'relative',

        padding: '12px 10px 12px 10px',
        border,
        background,
        borderRadius: '5px',
      }}
    >
      <div>{data.table}</div>
      {data.schema !== 'public' && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: -5, // Position above the node
            padding: '2px 5px',
            fontSize: '8px', // Smaller font size
            background: data.color ?? '#fff', // Different colors for selected and suggested
            borderRadius: '5px', // Rounded corners for the schema label
            transform: 'translateY(-100%)', // Move up fully above the node
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)', // Optional: adds shadow for better visibility
          }}
        >
          {data.schema}
        </div>
      )}
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
};

export default SuggestedNodeComponent;
