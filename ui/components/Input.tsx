import { observer } from 'mobx-react-lite';
import React, { useMemo } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Button } from '@mui/material';
import { PlayArrow, Loop } from '@mui/icons-material';
import PineInput from './PineInput';
import SqlInput from './SqlInput';
import { Session } from '../store/session';
import { getKeybindingDisplayForCommand } from '../utils/keybindings';
import { getCommandById } from '../utils/commands';
import { useStores } from '../store/store-container';

interface InputProps {
  session: Session;
  onRun?: () => void | Promise<void>;
}

const RunButton: React.FC<{ session: Session; onRun?: () => void | Promise<void> }> = observer(({ session, onRun }) => {
  const { global } = useStores();
  const keybinding = getKeybindingDisplayForCommand('run-query');
  const tooltip = keybinding ? `Run (${keybinding})` : 'Run';
  
  // Get the run-query command to check if it's enabled
  const runQueryCommand = useMemo(() => getCommandById('run-query'), []);
  
  const isDisabled = runQueryCommand ? !runQueryCommand.isEnabled(global, session) : false;
  
  return (
    <Button
      variant="contained"
      onClick={onRun || (() => session.evaluate())}
      disabled={isDisabled}
      startIcon={session.loading ? <Loop /> : <PlayArrow />}
      size="small"
      title={tooltip}
    sx={{
      backgroundColor: 'var(--primary-color)',
      color: 'var(--primary-text-color)',
      '&:hover': {
        backgroundColor: 'var(--primary-color-hover)',
      },
      '&:disabled': {
        backgroundColor: 'var(--icon-color)',
        color: 'var(--text-color)',
        opacity: 0.6,
      },
      minWidth: 'auto',
      px: 1.5,
      py: 0.5,
    }}
    >
      Run
    </Button>
  );
});

const Input: React.FC<InputProps> = observer(({ session, onRun }) => {
  const handleInputModeChange = (
    event: React.MouseEvent<HTMLElement>,
    newMode: 'pine' | 'sql' | null,
  ) => {
    if (newMode !== null && newMode !== session.inputMode) {
      session.setInputMode(newMode);
      
      // Show feedback message when switching modes
      if (newMode === 'pine') {
        session.setMessage('🌲 Switched to Pine mode - Edit with Pine DSL expressions');
      } else {
        session.setMessage('🗃️ Switched to SQL mode - Edit with raw SQL queries');
      }
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
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          {/* Input mode toggle */}
          <ToggleButtonGroup
            value={session.inputMode}
            exclusive
            onChange={handleInputModeChange}
            size="small"
            sx={{
              backgroundColor: 'var(--background-color)',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                fontSize: '0.75rem',
                fontWeight: 600,
                px: 1.5,
                py: 0.4,
                minHeight: '28px',
                minWidth: '44px',
                color: 'var(--text-color)',
                border: 'none',
                borderRadius: '12px',
                '&:hover': {
                  backgroundColor: 'rgba(25, 118, 210, 0.08)',
                  color: 'var(--primary-color)',
                },
                '&.Mui-selected': {
                  backgroundColor: 'var(--border-color)',
                  color: 'var(--text-color)',
                  fontWeight: 700,
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.1)',
                  },
                },
                '&:first-of-type': {
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                },
                '&:last-of-type': {
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                },
                '&:first-of-type.Mui-selected': {
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                },
                '&:last-of-type.Mui-selected': {
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                },
              },
            }}
          >
            <ToggleButton value="pine">PINE</ToggleButton>
            <ToggleButton value="sql">SQL</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box
          sx={{
            transition: 'all 0.3s ease-in-out',
            '& > *': {
              transition: 'opacity 0.2s ease-in-out',
            },
          }}
        >
          {session.inputMode === 'pine' ? (
            <PineInput session={session} />
          ) : (
            <SqlInput session={session} />
          )}
        </Box>

        {/* Run button positioned at bottom right */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            zIndex: 10,
          }}
        >
          <RunButton session={session} onRun={onRun} />
        </Box>
      </Box>
    </Box>
  );
});

export default Input;
