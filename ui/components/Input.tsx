import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStores } from '../store/store-container';
import { Box } from '@mui/material';
import InputControls from './InputControls';
import TextInput from './TextInput';
import VisualInput from './visual-input/VisualInput';

interface InputProps {
  sessionId: string;
}

const Input: React.FC<InputProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
  const isConnected = global.connected && !!global.getConnectionName();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {!isConnected && <Box sx={{ color: 'error.main', mb: 1 }}>Not connected</Box>}

      <Box
        sx={{
          border: '1px solid var(--border-color)',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        {session.inputMode === 'text' ? (
          <TextInput session={session} />
        ) : (
          <Box
            sx={{
              height: '177px',
            }}
          >
            <VisualInput sessionId={sessionId} />
          </Box>
        )}
      </Box>
      <InputControls session={session} />
    </Box>
  );
});

export default Input;
