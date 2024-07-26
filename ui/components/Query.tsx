import React, { useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import { Box, Typography } from '@mui/material';

const Query = observer(() => {
  const { global: store } = useStores();
  const codeRef = useRef<HTMLElement>(null);

  const onClick = () => {
    if (codeRef.current) {
      const v = codeRef.current.innerText;
      navigator.clipboard.writeText(v).then(() => {
        store.setCopiedMessage(v);
      });
    }
  };

  if (store.errorType === 'parse') {
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
          {store.error}
        </Typography>
      </Box>
    );
  }

  return (
    <pre onClick={onClick} style={{ cursor: 'pointer' }}>
      <code ref={codeRef} style={{ color: 'gray', fontFamily: 'monospace', fontSize: '12px' }}>
        {store.query}
      </code>
    </pre>
  );
});

export default Query;
