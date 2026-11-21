import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';

/**
 * Surfaces a failed attempt to connect to a saved/existing connection (e.g.
 * the DB is down or unreachable) -- global.connectionError is set by
 * GlobalStore's connect()/selectConnection() on failure, from wherever the
 * user triggered the attempt (the connection picker, the command palette
 * modal, etc).
 */
const ConnectionErrorSnackbar = () => {
  const { global } = useStores();

  return (
    <Snackbar
      open={!!global.connectionError}
      autoHideDuration={8000}
      onClose={() => global.setConnectionError(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      <Alert severity="error" onClose={() => global.setConnectionError(null)}>
        {global.connectionError}
      </Alert>
    </Snackbar>
  );
};

export default observer(ConnectionErrorSnackbar);
