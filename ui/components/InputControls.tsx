import { Box, Button, Switch, FormControlLabel } from '@mui/material';
import { KeyboardReturn, Loop } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { Session } from '../store/session';

interface ControlProps {
  session: Session;
}

const VisualizeToggle: React.FC<ControlProps> = observer(({ session }) => (
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
));

const RunButton: React.FC<ControlProps> = observer(({ session }) => (
  <Button
    variant="contained"
    onClick={() => session.evaluate()}
    disabled={!session.expression || session.loading}
    startIcon={session.loading ? <Loop /> : <KeyboardReturn />}
  >
    Run
  </Button>
));

const InputControls: React.FC<ControlProps> = observer(({ session }) => {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
      {/* <VisualizeToggle session={session} /> */}
      <RunButton session={session} />
    </Box>
  );
});

export default InputControls; 