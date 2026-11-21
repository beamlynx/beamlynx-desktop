import { Handle, NodeProps, Position } from 'reactflow';
import { InputNodeData, PineInputNode } from '../../../model';

const BlinkingCircle = () => (
  <div
    style={{
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      backgroundColor: '#0066cc',
      animation: 'pulse 1.5s ease-in-out infinite',
    }}
  />
);

const BlinkingCursor = () => (
  <span
    style={{
      display: 'inline-block',
      width: '1px',
      height: '20px',
      backgroundColor: '#000',
      marginLeft: '2px',
      animation: 'blink 1s step-end infinite',
    }}
  />
);


type PineNodeProps = NodeProps<InputNodeData>;
export const InputNode: React.FC<PineNodeProps> = ({ data }) => {
  const { isFocused, expression: label, sessionId } = data;
  if (!isFocused && !label) {
    return (
      <div
        style={{
          padding: '12px 10px 5px 10px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <BlinkingCircle />
        <style>
          {`
            @keyframes pulse {
              0% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.2); opacity: 0.7; }
              100% { transform: scale(1); opacity: 1; }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '12px 10px 5px 10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        border: '1px solid #ccc',
        borderRadius: '10px',
      }}
    >
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <div style={{ 
        fontSize: '14px', 
        fontWeight: 'bold', 
        marginBottom: '20px',
        fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
        color: '#4a4a4a'
      }}>
        {data.operation}
      </div>
      <div
        style={{ fontFamily: 'monospace', fontSize: '14px', display: 'flex', alignItems: 'center' }}
      >
        {/* Replace trailing spaces with a space character that is rendered */}
        {data.expression.split('|').pop()?.replace(/\s+$/, '\u00A0')}
        {data.isFocused && <BlinkingCursor />}
      </div>
      <style>
        {`
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
        `}
      </style>
    </div>
  );
};
