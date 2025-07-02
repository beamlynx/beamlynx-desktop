import SecurityIcon from '@mui/icons-material/Security';
import { Box, Button, Modal, TextField, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useStores } from '../store/store-container';
import { Alert } from '@mui/material';

const SecurityNotice = () => (
  <Box
    sx={{
      border: '1px solid var(--border-color)',
      borderRadius: 1,
      p: 2,
      mb: 2,
      bgcolor: 'var(--node-column-bg)',
      display: 'flex',
      alignItems: 'center',
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
      <SecurityIcon sx={{ fontSize: 20, mr: 1, color: 'var(--icon-color)' }} />
      <Typography variant="caption" sx={{ color: 'var(--text-color)' }}>
        Pine never stores credentials. Your connection details are securely held in memory only for
        the duration of the server session.
      </Typography>
    </Box>
  </Box>
);

const SuccessMessage = () => (
  <Alert 
    severity="success" 
    sx={{ 
      mb: 2,
      '&.MuiAlert-standardSuccess': {
        backgroundColor: '#e8f5e8',
        border: '1px solid var(--icon-color-highlight)',
        color: '#2e7d32',
        '& .MuiAlert-icon': {
          color: 'var(--icon-color-highlight)',
        },
      },
      // Override for dark theme
      '[data-theme="dark"] &': {
        backgroundColor: 'var(--node-column-bg)',
        border: '1px solid var(--icon-color-highlight)',
        color: 'var(--text-color)',
        '& .MuiAlert-icon': {
          color: 'var(--icon-color-highlight)',
        },
      },
    }}
  >
    Connected!
  </Alert>
);

const ErrorMessage = ({ message }: { message: string }) => (
  <Alert 
    severity="error" 
    sx={{ 
      mb: 2,
      '&.MuiAlert-standardError': {
        backgroundColor: 'var(--text-warning-color)',
        color: '#ffffff',
        '& .MuiAlert-icon': {
          color: '#ffffff',
        },
      },
      // Override for dark theme
      '[data-theme="dark"] &': {
        backgroundColor: 'var(--node-column-bg)',
        border: '1px solid var(--text-warning-color)',
        color: 'var(--text-color)',
        '& .MuiAlert-icon': {
          color: 'var(--text-warning-color)',
        },
      },
    }}
  >
    {message}
  </Alert>
);

const Settings = () => {
  const { global } = useStores();
  const [dbHost, setDbHost] = useState('');
  const [dbPort, setDbPort] = useState('');
  const [dbName, setDbName] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const connectionId = await global.connect({
        dbHost,
        dbPort,
        dbName,
        dbUser,
        dbPassword,
      });
      console.debug('Database connection created with ID:', connectionId);
      setError('');
      setConnected(true);

      // Wait for 1 second and then close the settings
      setTimeout(() => {
        global.setShowSettings(false);
      }, 1000);
    } catch (error) {
      const message = (error as Error)?.message ?? 'Unknown error';
      setError(message);
    } finally {
      setConnecting(false);
    }
  };

  const handleClose = () => {
    global.setShowSettings(false);
  };

  return (
    <Modal
      open={global.showSettings}
      onClose={handleClose}
      aria-labelledby="modal-modal-title"
      aria-describedby="modal-modal-description"
    >
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 400,
          bgcolor: 'var(--background-color)',
          border: '1px solid var(--border-color)',
          boxShadow: 24,
          p: 4,
          borderRadius: 2,
          outline: 'none', // Remove the focus outline
        }}
      >
        <Typography variant="h6" component="h2" gutterBottom sx={{ color: 'var(--text-color)' }}>
          Database Connection
        </Typography>

        {!connected && !error && <SecurityNotice />}
        {connected && !error && <SuccessMessage />}
        {error && <ErrorMessage message={error} />}

        <Box>
          <TextField
            fullWidth
            margin="dense"
            label="Username"
            id="db-username"
            name="username"
            autoComplete="username"
            value={dbUser}
            onChange={e => setDbUser(e.target.value)}
            disabled={connected}
            sx={{
              '& .MuiInputLabel-root': { color: 'var(--text-color)' },
              '& .MuiInputLabel-root.Mui-focused': { color: 'var(--primary-color)' },
              '& .MuiOutlinedInput-root': {
                color: 'var(--text-color)',
                '& fieldset': { borderColor: 'var(--border-color)' },
                '&:hover fieldset': { borderColor: 'var(--text-color)' },
                '&.Mui-focused fieldset': { borderColor: 'var(--primary-color)' },
              },
            }}
          />
          <TextField
            fullWidth
            margin="dense"
            label="Password"
            id="db-password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={dbPassword}
            onChange={e => setDbPassword(e.target.value)}
            disabled={connected}
            sx={{
              '& .MuiInputLabel-root': { color: 'var(--text-color)' },
              '& .MuiInputLabel-root.Mui-focused': { color: 'var(--primary-color)' },
              '& .MuiOutlinedInput-root': {
                color: 'var(--text-color)',
                '& fieldset': { borderColor: 'var(--border-color)' },
                '&:hover fieldset': { borderColor: 'var(--text-color)' },
                '&.Mui-focused fieldset': { borderColor: 'var(--primary-color)' },
              },
            }}
          />
          <TextField
            fullWidth
            margin="dense"
            label="Server"
            id="db-server"
            name="server"
            autoComplete="off"
            value={dbHost}
            onChange={e => setDbHost(e.target.value)}
            disabled={connected}
            sx={{
              '& .MuiInputLabel-root': { color: 'var(--text-color)' },
              '& .MuiInputLabel-root.Mui-focused': { color: 'var(--primary-color)' },
              '& .MuiOutlinedInput-root': {
                color: 'var(--text-color)',
                '& fieldset': { borderColor: 'var(--border-color)' },
                '&:hover fieldset': { borderColor: 'var(--text-color)' },
                '&.Mui-focused fieldset': { borderColor: 'var(--primary-color)' },
              },
            }}
          />
          <TextField
            fullWidth
            margin="dense"
            label="Port"
            id="db-port"
            name="port"
            autoComplete="off"
            value={dbPort}
            onChange={e => setDbPort(e.target.value)}
            disabled={connected}
            sx={{
              '& .MuiInputLabel-root': { color: 'var(--text-color)' },
              '& .MuiInputLabel-root.Mui-focused': { color: 'var(--primary-color)' },
              '& .MuiOutlinedInput-root': {
                color: 'var(--text-color)',
                '& fieldset': { borderColor: 'var(--border-color)' },
                '&:hover fieldset': { borderColor: 'var(--text-color)' },
                '&.Mui-focused fieldset': { borderColor: 'var(--primary-color)' },
              },
            }}
          />
          <TextField
            fullWidth
            margin="dense"
            label="Database name"
            id="db-name"
            name="database"
            autoComplete="off"
            value={dbName}
            onChange={e => setDbName(e.target.value)}
            disabled={connected}
            sx={{
              '& .MuiInputLabel-root': { color: 'var(--text-color)' },
              '& .MuiInputLabel-root.Mui-focused': { color: 'var(--primary-color)' },
              '& .MuiOutlinedInput-root': {
                color: 'var(--text-color)',
                '& fieldset': { borderColor: 'var(--border-color)' },
                '&:hover fieldset': { borderColor: 'var(--text-color)' },
                '&.Mui-focused fieldset': { borderColor: 'var(--primary-color)' },
              },
            }}
          />
          <Box
            sx={{
              mt: 2,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              justifyContent: 'space-between',
            }}
          >
            <Button 
              variant="outlined" 
              onClick={handleClose}
              sx={{
                borderColor: 'var(--border-color)',
                color: 'var(--text-color)',
                '&:hover': {
                  borderColor: 'var(--primary-color)',
                  backgroundColor: 'var(--node-column-bg)',
                },
              }}
            >
              Close
            </Button>
            <Button
              variant="contained"
              onClick={handleConnect}
              disabled={!!connected || connecting}
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
              }}
            >
              {connected ? 'Connected' : connecting ? 'Connecting...' : 'Connect'}
            </Button>
          </Box>
        </Box>
      </Box>
    </Modal>
  );
};

export default observer(Settings);
