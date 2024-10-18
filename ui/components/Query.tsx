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

  if (session.error) {
    return (
      <Box sx={{ ml: 2 }}>
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
      <Box sx={{ ml: 2 }}>
        <pre onClick={onClick} style={{ cursor: 'pointer' }}>
          <code style={{ color: 'gray', fontFamily: 'monospace', fontSize: '12px' }}>
            {session.query.length > 450 ? session.query.substring(0, 450) + ' ...' : session.query}
          </code>
        </pre>
      </Box>
    );
  }

  return (
    <div style={{ margin: 30 }}>
      <code style={{ color: 'gray', fontFamily: 'monospace', fontSize: '12px' }}>
        SQL shows here for a valid pine expression.
      </code>
    </div>
  );
});

export default Query;
