import React from 'react';
import { Handle, NodeProps, Position } from 'reactflow';
import { PineNodeData } from '../model';

const handleStyle = {
    width: '2px',
    height: '2px',
    background: 'darkgray',
    borderRadius: '50%',
};

type PineNodeProps = NodeProps<PineNodeData>;

const PineNodeComponent: React.FC<PineNodeProps> = ({ data }) => (
    <div style={{
        position: 'relative',
        padding: 10,
        border: `1px solid ${data.type === 'selected' ? 'darkgray' : 'orange'}`,
        background: '#fff',
        borderRadius: '5px'
    }}>
        <div>{data.table}</div>
        {data.schema !== 'public' && (
            <div style={{
                position: 'absolute',
                right: 0,
                top: -2,                               // Position above the node
                padding: '2px 5px',
                fontSize: '10px',                       // Smaller font size
                background: data.color, // Different colors for selected and suggested
                borderRadius: '5px',                    // Rounded corners for the schema label
                transform: 'translateY(-100%)',         // Move up fully above the node
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)' // Optional: adds shadow for better visibility
            }}>
                {data.schema}
            </div>
        )}
        <Handle type="target" position={Position.Left} 
            style={handleStyle}
        />
        <Handle type="source" position={Position.Right}
            style={handleStyle}
         />

    </div>
);

export default PineNodeComponent;
