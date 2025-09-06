import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStores } from '../store/store-container';
import { Box, ToggleButton, ToggleButtonGroup, Tooltip, IconButton, Button } from '@mui/material';
import { Info, PlayArrow, Loop } from '@mui/icons-material';
import PineInput from './PineInput';
import SqlInput from './SqlInput';
import { Session } from '../store/session';

interface InputProps {
  sessionId: string;
}

const RunButton: React.FC<{ session: Session }> = observer(({ session }) => (
  <Button
    variant="contained"
    onClick={() => session.evaluate()}
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

const Input: React.FC<InputProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);

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
            title="Pine is a simpler DSL that compiles to SQL. Switch modes to edit in Pine expressions or raw SQL queries."
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

          {/* Segmented control toggle */}
          <Tooltip
            title={
              session.inputMode === 'pine'
                ? 'Switch to SQL mode (edit raw SQL queries)'
                : 'Switch to Pine mode (edit Pine expressions)'
            }
            placement="bottom-end"
            arrow
          >
            <ToggleButtonGroup
              value={session.inputMode}
              exclusive
              onChange={handleInputModeChange}
              size="small"
              sx={{
                backgroundColor: 'var(--background-color)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                overflow: 'hidden',
                '& .MuiToggleButtonGroup-grouped': {
                  border: 'none',
                  '&:not(:first-of-type)': {
                    borderLeft: 'none',
                    marginLeft: 0,
                  },
                  '&:first-of-type': {
                    borderTopLeftRadius: '12px',
                    borderBottomLeftRadius: '12px',
                  },
                  '&:last-of-type': {
                    borderTopRightRadius: '12px',
                    borderBottomRightRadius: '12px',
                  },
                },
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  px: 1.5,
                  py: 0.4,
                  minHeight: '28px',
                  minWidth: '42px',
                  color: 'var(--text-color)',
                  backgroundColor: 'transparent',
                  border: '1px solid transparent',
                  transition: 'all 0.2s ease-in-out',
                  '&.Mui-selected': {
                    backgroundColor: 'rgba(25, 118, 210, 0.08)',
                    color: 'var(--primary-color)',
                    fontWeight: 600,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    borderColor: 'rgba(25, 118, 210, 0.3)',
                    '&:hover': {
                      backgroundColor: 'rgba(25, 118, 210, 0.12)',
                      borderColor: 'rgba(25, 118, 210, 0.4)',
                    },
                  },
                  '&:hover:not(.Mui-selected)': {
                    backgroundColor: 'var(--hover-color)',
                    color: 'var(--text-color)',
                  },
                },
              }}
            >
              <ToggleButton value="pine">Pine</ToggleButton>
              <ToggleButton value="sql">SQL</ToggleButton>
            </ToggleButtonGroup>
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
          <RunButton session={session} />
        </Box>
      </Box>
    </Box>
  );
});

export default Input;
