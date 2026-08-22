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
  /** See PineInput/SqlInput's own doc comment - forwarded to whichever
   * editor is currently shown. Defaults true (Legacy Layout's behavior). */
  autoFocus?: boolean;
}

export const RunButton: React.FC<{ session: Session; onRun?: () => void | Promise<void> }> = observer(
  ({ session, onRun }) => {
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
          fontFamily: 'var(--canvas-font)',
        }}
      >
        Run
      </Button>
    );
  },
);

const Input: React.FC<InputProps> = observer(({ session, onRun, autoFocus = true }) => {
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
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          border: '1px solid var(--border-color)',
          borderRadius: 1,
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
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
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                fontFamily: 'var(--canvas-font)',
                fontSize: '0.75rem',
                fontWeight: 600,
                px: 1.5,
                py: 0.4,
                minHeight: '28px',
                minWidth: '44px',
                color: 'var(--text-color)',
                border: 'none',
                borderRadius: '4px',
                '&:hover': {
                  backgroundColor: 'var(--canvas-chip-bg)',
                  color: 'var(--primary-color)',
                },
                '&.Mui-selected': {
                  backgroundColor: 'var(--border-color)',
                  color: 'var(--text-color)',
                  fontWeight: 700,
                  '&:hover': {
                    backgroundColor: 'color-mix(in srgb, var(--canvas-trace) 20%, var(--border-color))',
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
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            transition: 'all 0.3s ease-in-out',
            '& > *': {
              transition: 'opacity 0.2s ease-in-out',
              height: '100%',
            },
          }}
        >
          {session.inputMode === 'pine' ? (
            <PineInput session={session} autoFocus={autoFocus} />
          ) : (
            <SqlInput session={session} autoFocus={autoFocus} />
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
