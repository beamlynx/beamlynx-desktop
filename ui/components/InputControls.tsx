import { Box, Button, Switch, FormControlLabel } from '@mui/material';
import { KeyboardReturn, Loop } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { Session } from '../store/session';

interface InputControlsProps {
  session: Session;
}

const InputControls: React.FC<InputControlsProps> = observer(({ session }) => {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
      <FormControlLabel
        control={
          <Switch
            checked={session.inputMode === 'visual'}
            onChange={() => {
              session.inputMode = session.inputMode === 'visual' ? 'text' : 'visual';
            }}
          />
        }
        label="Visualize"
      />
      <Button
        variant="contained"
        onClick={() => session.evaluate()}
        disabled={!session.expression || session.loading}
        startIcon={session.loading ? <Loop /> : <KeyboardReturn />}
      >
        Run
      </Button>
    </Box>
  );
});

export default InputControls; 