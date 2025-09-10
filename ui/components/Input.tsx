import { observer } from 'mobx-react-lite';
import React from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Tooltip, IconButton, Button } from '@mui/material';
import { Info, PlayArrow, Loop } from '@mui/icons-material';
import PineInput from './PineInput';
import SqlInput from './SqlInput';
import { Session } from '../store/session';

interface InputProps {
  session: Session;
  onRun?: () => void | Promise<void>;
}

const RunButton: React.FC<{ session: Session; onRun?: () => void | Promise<void> }> = observer(({ session, onRun }) => (
  <Button
    variant="contained"
    onClick={onRun || (() => session.evaluate())}
    disabled={(!session.expression && !session.query) || session.loading}
    startIcon={session.loading ? <Loop /> : <PlayArrow />}
    size="small"
    title="Run (Cmd/Ctrl + Enter)"
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
));

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
          {/* Info icon with tooltip */}
          <Tooltip
            title="Pine is a simpler DSL that compiles to SQL. Click the button to switch between Pine expressions and raw SQL queries."
            placement="bottom-end"
            arrow
          >
            <IconButton
              size="small"
              sx={{
                width: 20,
                height: 20,
                color: 'var(--text-color)',
                opacity: 0.6,
                '&:hover': {
                  opacity: 1,
                  backgroundColor: 'var(--hover-color)',
                },
              }}
            >
              <Info sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>

          {/* Compact mode button */}
          <Tooltip
            title={`Currently in ${session.inputMode.toUpperCase()} mode - click to switch to ${session.inputMode === 'pine' ? 'SQL' : 'Pine'}`}
            placement="bottom-end"
            arrow
          >
            <Button
              variant="outlined"
              size="small"
              onClick={() => session.setInputMode(session.inputMode === 'pine' ? 'sql' : 'pine')}
              sx={{
                backgroundColor: 'var(--background-color)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                textTransform: 'none',
                fontSize: '0.75rem',
                fontWeight: 600,
                px: 1.5,
                py: 0.4,
                minHeight: '28px',
                minWidth: '44px',
                color: 'var(--text-color)',
                borderColor: 'var(--border-color)',
                '&:hover': {
                  backgroundColor: 'rgba(25, 118, 210, 0.08)',
                  borderColor: 'rgba(25, 118, 210, 0.3)',
                  color: 'var(--primary-color)',
                },
              }}
            >
              {session.inputMode.toUpperCase()}
            </Button>
          </Tooltip>
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
