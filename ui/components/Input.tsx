import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStores } from '../store/store-container';
import { Box, ToggleButton, ToggleButtonGroup } from '@mui/material';
import PineInput from './PineInput';
import SqlInput from './SqlInput';

interface InputProps {
  sessionId: string;
}

const Input: React.FC<InputProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);

  const handleInputModeChange = (
    event: React.MouseEvent<HTMLElement>,
    newMode: 'pine' | 'sql' | null,
  ) => {
    if (newMode !== null) {
      session.setInputMode(newMode);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <Box
        sx={{
          border: '1px solid var(--border-color)',
          borderRadius: 1,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Input mode toggle positioned at top right */}
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 10,
          }}
        >
          <ToggleButtonGroup
            value={session.inputMode}
            exclusive
            onChange={handleInputModeChange}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                fontSize: '0.75rem',
                px: 1,
                py: 0.25,
                border: '1px solid var(--border-color)',
                color: 'var(--text-color)',
                backgroundColor: 'var(--background-color)',
                minHeight: '24px',
                '&.Mui-selected': {
                  backgroundColor: 'var(--primary-color)',
                  color: 'var(--primary-text-color)',
                  '&:hover': {
                    backgroundColor: 'var(--primary-color-hover)',
                  },
                },
                '&:hover': {
                  backgroundColor: 'var(--hover-color)',
                },
              },
            }}
          >
            <ToggleButton value="pine">Pine</ToggleButton>
            <ToggleButton value="sql">SQL</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {session.inputMode === 'pine' ? (
          <PineInput session={session} />
        ) : (
          <SqlInput session={session} />
        )}
      </Box>
    </Box>
  );
});

export default Input;
