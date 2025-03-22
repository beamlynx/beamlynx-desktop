import { useState } from 'react';

export const RunPineServer = () => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(
      'docker run -p 33333:33333 --add-host host.docker.internal:host-gateway ahmadnazir/pine:latest',
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', margin: 20 }}>
      <div
        style={{
          padding: 15,
          backgroundColor: '#fff8e1',
          borderRadius: 5,
          border: '1px solid #ffe082',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span style={{ marginRight: 10, color: '#ff9800' }}>⚠️</span>
        <span>Seems like you are not connected!</span>
      </div>

      <p>Run the pine server:</p>
      <div style={{ marginBottom: 20, position: 'relative' }}>
        <div
          style={{
            padding: 15,
            paddingRight: 40,
            backgroundColor: '#f5f5f5',
            borderRadius: 5,
            border: '1px solid #ddd',
            fontFamily: 'monospace',
          }}
        >
          docker run -p 33333:33333 --add-host host.docker.internal:host-gateway
          ahmadnazir/pine:latest
        </div>
        <button
          onClick={copyToClipboard}
          style={{
            position: 'absolute',
            top: 5,
            right: 5,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 5,
          }}
        >
          {copied ? '✓' : '📋'}
        </button>
      </div>

      <p>Connect to the database by clicking on the top left icon.</p>
    </div>
  );
};
