import React, { useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import { Box, Typography } from '@mui/material';

interface QueryProps {
  sessionId: string;
}

const Query: React.FC<QueryProps> = observer(({ sessionId }) => {
  const { global: store } = useStores();
  const session = store.getSession(sessionId);

  const onClick = () => {
    if (!session.query) {
      return;
    }
    const v = session.query;
    navigator.clipboard.writeText(v).then(() => {
      store.setCopiedMessage(sessionId, v);
    });
  };

  if (session.error && session.errorType === 'parse') {
    return (
      <Box sx={{ margin: 1 }}>
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'monospace',
            whiteSpace: 'break-spaces',
            lineHeight: 1,
            color: 'red',
          }}
        >
          {session.error}
        </Typography>
      </Box>
    );
  }

  if (session.query) {
    return (
      <div style={{ margin: 10 }}>
        <code
          onClick={onClick}
          style={{
            color: 'gray',
            fontFamily: 'monospace',
            fontSize: '12px',
            whiteSpace: 'pre-wrap', // Use pre-wrap to preserve formatting and wrap
            display: 'block',
            wordWrap: 'break-word', // Handle long words
            cursor: 'pointer', // Use mouse pointer to make it obvious
          }}
        >
          {session.query}
        </code>
      </div>
    );
  }

  return (
    <div style={{ margin: 10 }}>
      <code style={{ color: 'gray', fontFamily: 'monospace', fontSize: '12px' }}>
        SQL shows here for a valid pine expression.
      </code>
    </div>
  );
});

export default Query;
