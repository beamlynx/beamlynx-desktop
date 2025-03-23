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
          maxWidth: '400px',
        }}
      >
        <span style={{ marginRight: 10, color: '#ff9800' }}>⚠️</span>
        <span className="text-warning">Seems like Pine server isn&apos;t running!</span>
      </div>

      <p className="text-primary">Run the pine server:</p>
      <div style={{ marginBottom: 20, position: 'relative', maxWidth: '400px' }}>
        <div
          style={{
            padding: 15,
            paddingRight: 40,
            backgroundColor: '#f5f5f5',
            borderRadius: 5,
            border: '1px solid #ddd',
            fontFamily: 'monospace',
            whiteSpace: 'pre',
          }}
        >
          <code>
            <span style={{ color: '#666' }}>docker</span> <span style={{ color: '#666' }}>run</span>{' '}
            <span style={{ color: '#aaa' }}>\</span>
            {'\n  '}
            <span style={{ color: '#666' }}>-p</span>{' '}
            <span style={{ color: '#999' }}>33333:33333</span>{' '}
            <span style={{ color: '#aaa' }}>\</span>
            {'\n  '}
            <span style={{ color: '#666' }}>--add-host</span>{' '}
            <span style={{ color: '#999' }}>host.docker.internal:host-gateway</span>{' '}
            <span style={{ color: '#aaa' }}>\</span>
            {'\n  '}
            <span style={{ color: '#666' }}>ahmadnazir/pine:latest</span>
          </code>
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

      <p className="text-primary">Once that is done, you will be able to connect to a database.</p>
    </div>
  );
};
