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

  const codeRef = useRef<HTMLElement>(null);

  const onClick = () => {
    if (codeRef.current) {
      const v = codeRef.current.innerText;
      navigator.clipboard.writeText(v).then(() => {
        store.setCopiedMessage(sessionId, v);
      });
    }
  };

  if (session.errorType === 'parse') {
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

  return (
    <pre onClick={onClick} style={{ cursor: 'pointer' }}>
      <code ref={codeRef} style={{ color: 'gray', fontFamily: 'monospace', fontSize: '12px' }}>
        {session.query}
      </code>
    </pre>
  );
});

export default Query;
