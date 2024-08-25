import React from 'react';
import { Handle, NodeProps, Position } from 'reactflow';
import { PineSelectedNode, SelectedNodeData } from '../model';

const handleStyle: React.CSSProperties = {
  width: '2px',
  height: '2px',
  background: 'darkgray',
  borderRadius: '50%',
};

const maroon = '#800000';

const orderChipStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  transform: 'translate(-50%, -50%)', // Centers the chip on the corner
  width: '20px', // Diameter of the chip
  height: '20px', // Diameter of the chip
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%', // Makes it circular
  background: maroon, // Background color of the chip
  color: 'white', // Text color
  fontSize: '12px', // Adjust based on your preference
  boxShadow: '0 2px 4px rgba(0,0,0,0.25)', // Optional shadow for better visibility
  fontWeight: 'bold', // Optional: makes the text bold
};

type PineNodeProps = NodeProps<SelectedNodeData>;

const SelectedNodeComponent: React.FC<PineNodeProps> = ({ data }) => {
  const { order, table, schema, color, alias } = data;
  const background = 'lightgray';
  const border = `2px solid black`;

  return (
    <div>
      <div
        style={{
          position: 'relative',
          padding: '12px 10px 5px 10px',
          border,
          background,
          borderRadius: '5px',
        }}
      >
        {table}
        <div
          style={{
            textAlign: 'right', // Right justify the alias within its container
            fontSize: '8px', // Smaller font size
            fontFamily: 'Courier, monospace', // Set the font to Courier
          }}
        >
          {alias}
        </div>
      </div>

      {<div style={orderChipStyle}>{order}</div>}
      {schema !== 'public' && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            padding: '2px 5px',
            fontSize: '8px', // Smaller font size
            background: color ?? '#fff', // Different colors for selected and suggested
            borderRadius: '5px', // Rounded corners for the schema label
            transform: 'translateY(-100%)', // Move up fully above the node
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)', // Optional: adds shadow for better visibility
          }}
        >
          {schema}
        </div>
      )}

      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
};

export default SelectedNodeComponent;
