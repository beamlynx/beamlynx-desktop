import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SecurityIcon from '@mui/icons-material/Security';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  MenuItem,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { useStores } from '../../store/store-container';
import { isDesktop, isPlayground } from '../../store/util';
import { DecryptionFailedError } from '../../store/global.store';
import { parseConnectionString } from '../../utils/connectionString';

const REMOVE_CONFIRM_TIMEOUT_MS = 3000;

// Single entry today -- Pine only speaks Postgres wire protocol -- but kept
// as a list (not a hardcoded default) so adding a second type later is just
// another entry here, not a rework of the dropdown/port-defaulting wiring.
const DB_TYPES = [{ value: 'postgres', label: 'PostgreSQL', defaultPort: '5432' }] as const;
type DbTypeValue = (typeof DB_TYPES)[number]['value'];

const fieldSx = {
  '& .MuiInputLabel-root': { color: 'var(--text-color)' },
  '& .MuiInputLabel-root.Mui-focused': { color: 'var(--primary-color)' },
  '& .MuiOutlinedInput-root': {
    color: 'var(--text-color)',
    '& fieldset': { borderColor: 'var(--border-color)' },
    '&:hover fieldset': { borderColor: 'var(--text-color)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--primary-color)' },
  },
};

const SecurityNotice = ({ persistenceAvailable }: { persistenceAvailable?: boolean }) => {
  // Desktop's normal case (persistence available) is the expected default,
  // not an exception worth a standing notice -- only the cases where
  // behavior deviates from that (nothing persisted at all, or persistence
  // unavailable on this device) are worth surfacing here.
  if (isDesktop() && persistenceAvailable !== false) {
    return null;
  }

  const message = !isDesktop()
    ? 'Pine never stores credentials. Your connection details are securely held in memory only for the duration of the server session.'
    : "This device has no secure OS credential storage available, so connections can't be saved between sessions — you'll need to re-enter details each time you restart the app.";

  return (
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
          {message}
        </Typography>
      </Box>
    </Box>
  );
};

/**
 * Add-a-connection form -- was the entirety of pages/settings.tsx, now the
 * "add" sub-view of the Connections settings section. Auto-opens (see
 * ConnectionsSection below) when global.reconnectHint is set -- a saved
 * profile's password failed to decrypt (see DecryptionFailedError) and the
 * user needs to re-enter just the password, not retype the whole form.
 */
const AddConnectionForm = ({ onDone }: { onDone: () => void }) => {
  const { global } = useStores();
  const [reconnectHint] = useState(() => global.consumeReconnectHint());
  const [dbType, setDbType] = useState<DbTypeValue>('postgres');
  const [dbHost, setDbHost] = useState(reconnectHint?.dbHost ?? '');
  const [dbPort, setDbPort] = useState(reconnectHint?.dbPort ?? DB_TYPES[0].defaultPort);
  const [dbName, setDbName] = useState(reconnectHint?.dbName ?? '');
  const [dbUser, setDbUser] = useState(reconnectHint?.dbUser ?? '');
  const [dbPassword, setDbPassword] = useState('');
  const [connectionString, setConnectionString] = useState('');
  const [connectionStringError, setConnectionStringError] = useState('');
  const [showConnectionString, setShowConnectionString] = useState(false);
  const [mode, setMode] = useState<'fields' | 'string'>('fields');
  const [error, setError] = useState(
    reconnectHint ? "Couldn't unlock the saved password for this connection — please re-enter it." : '',
  );
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  const handleDbTypeChange = (value: DbTypeValue) => {
    setDbType(value);
    setDbPort(DB_TYPES.find(t => t.value === value)?.defaultPort ?? '');
  };

  const handleConnectionStringChange = (value: string) => {
    setConnectionString(value);

    if (!value.trim()) {
      setConnectionStringError('');
      return;
    }

    try {
      const parsed = parseConnectionString(value);
      setDbUser(parsed.dbUser);
      setDbPassword(parsed.dbPassword);
      setDbHost(parsed.dbHost);
      setDbPort(parsed.dbPort);
      setDbName(parsed.dbName);
      setConnectionStringError('');
    } catch (parseError) {
      // Only surface the error once the string looks like a connection string;
      // otherwise every keystroke of a partial paste flashes an error.
      if (value.includes('://')) {
        setConnectionStringError((parseError as Error).message);
      } else {
        setConnectionStringError('');
      }
    }
  };

  const handleConnect = async () => {
    if (connected || connecting) {
      return;
    }
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

      // Wait for 1 second, then return to the connection list.
      setTimeout(onDone, 1000);
    } catch (error) {
      const message = (error as Error)?.message ?? 'Unknown error';
      setError(message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Box
      component="form"
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        handleConnect();
      }}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      {/* Only the fields scroll -- Cancel/Connect stay pinned below as a
          fixed footer (same pattern as the connections list's "+ Add"
          button) so the primary action is never a scroll away. */}
      <Box className="styled-scrollbar" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 1.5 }}>
        {!connected && !error && (
          <SecurityNotice persistenceAvailable={global.credentialsStatus?.persistenceAvailable} />
        )}
        {connected && !error && (
          <Alert
            severity="success"
            sx={{
              mb: 2,
              '&.MuiAlert-standardSuccess': {
                backgroundColor: '#e8f5e8',
                border: '1px solid var(--icon-color-highlight)',
                color: '#2e7d32',
                '& .MuiAlert-icon': { color: 'var(--icon-color-highlight)' },
              },
              '[data-theme="dark"] &': {
                backgroundColor: 'var(--node-column-bg)',
                border: '1px solid var(--icon-color-highlight)',
                color: 'var(--text-color)',
                '& .MuiAlert-icon': { color: 'var(--icon-color-highlight)' },
              },
            }}
          >
            Connected!
          </Alert>
        )}
        {(error || connectionStringError) && (
          <Alert
            severity="error"
            sx={{
              mb: 2,
              '&.MuiAlert-standardError': {
                backgroundColor: 'var(--text-warning-color)',
                color: '#ffffff',
                '& .MuiAlert-icon': { color: '#ffffff' },
              },
              '[data-theme="dark"] &': {
                backgroundColor: 'var(--node-column-bg)',
                border: '1px solid var(--text-warning-color)',
                color: 'var(--text-color)',
                '& .MuiAlert-icon': { color: 'var(--text-warning-color)' },
              },
            }}
          >
            {error || connectionStringError}
          </Alert>
        )}

        <Tabs value={mode} onChange={(_e, v) => setMode(v)} sx={{ mb: 2, minHeight: 36 }}>
          <Tab label="Fields" value="fields" sx={{ minHeight: 36 }} />
          <Tab label="Connection string" value="string" sx={{ minHeight: 36 }} />
        </Tabs>

        {mode === 'fields' ? (
          <>
            <TextField
              select
              fullWidth
              margin="dense"
              label="Database type"
              id="db-type"
              name="db-type"
              value={dbType}
              onChange={e => handleDbTypeChange(e.target.value as DbTypeValue)}
              disabled={connected}
              sx={fieldSx}
            >
              {DB_TYPES.map(({ value, label }) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
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
              sx={fieldSx}
            />
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
              sx={fieldSx}
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
              sx={fieldSx}
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
              sx={fieldSx}
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
              sx={fieldSx}
            />
          </>
        ) : (
          <TextField
            fullWidth
            margin="dense"
            label="Connection string"
            id="db-connection-string"
            name="connection-string"
            type={showConnectionString ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="postgresql://user:password@host:5432/database"
            value={connectionString}
            onChange={e => handleConnectionStringChange(e.target.value)}
            disabled={connected}
            helperText="Filling this in also fills the individual fields above -- switch tabs to check them."
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showConnectionString ? 'Hide connection string' : 'Show connection string'}
                      onClick={() => setShowConnectionString(show => !show)}
                      edge="end"
                      size="small"
                      sx={{ color: 'var(--icon-color)' }}
                    >
                      {showConnectionString ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            sx={fieldSx}
          />
        )}
      </Box>

      <Box sx={{ flexShrink: 0, mt: 2, display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between' }}>
        <Button
          type="button"
          variant="outlined"
          onClick={onDone}
          sx={{
            borderColor: 'var(--border-color)',
            color: 'var(--text-color)',
            '&:hover': { borderColor: 'var(--primary-color)', backgroundColor: 'var(--node-column-bg)' },
          }}
        >
          {connected ? 'Done' : 'Cancel'}
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={!!connected || connecting}
          sx={{
            backgroundColor: 'var(--primary-color)',
            color: 'var(--primary-text-color)',
            '&:hover': { backgroundColor: 'var(--primary-color-hover)' },
            '&:disabled': { backgroundColor: 'var(--icon-color)', color: 'var(--text-color)', opacity: 0.6 },
          }}
        >
          {connected ? 'Connected' : connecting ? 'Connecting...' : 'Connect'}
        </Button>
      </Box>
    </Box>
  );
};

/**
 * The Connections settings section: a list of saved connections (switch
 * active, toggle MCP access, delete) plus an "add connection" sub-view.
 * Absorbs what used to be pages/settings.tsx (the add form) and the
 * connection-management half of ActiveConnection.tsx's dropdown menu --
 * that dropdown is now just a quick switcher, see ActiveConnection.tsx.
 */
const ConnectionsSection = () => {
  const { global } = useStores();
  const [adding, setAdding] = useState(() => !!global.reconnectHint || global.consumeSettingsConnectionsAdding());
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [switchingConnection, setSwitchingConnection] = useState(false);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => clearConfirmTimeout, []);

  const clearConfirmTimeout = () => {
    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
  };

  const activeSession = global.sessions[global.activeSessionId];

  const handleRemoveClick = (e: MouseEvent<SVGSVGElement>, id: string) => {
    e.stopPropagation();
    clearConfirmTimeout();
    if (confirmingRemoveId === id) {
      setConfirmingRemoveId(null);
      setRemovingId(id);
      global.deleteConnection(id).finally(() => setRemovingId(null));
      return;
    }
    setConfirmingRemoveId(id);
    confirmTimeoutRef.current = setTimeout(() => setConfirmingRemoveId(null), REMOVE_CONFIRM_TIMEOUT_MS);
  };

  const handleSwitchTo = async (id: string) => {
    if (isDesktop()) {
      if (id === global.activeProfileId) return;
      setSwitchingConnection(true);
      try {
        await global.connectToSavedProfile(id);
      } catch (e) {
        if (e instanceof DecryptionFailedError) {
          setAdding(true);
        }
      } finally {
        setSwitchingConnection(false);
      }
      return;
    }
    if (activeSession && id === activeSession.connectionId && id === global.connection) return;
    setSwitchingConnection(true);
    try {
      await global.selectConnection(id);
    } finally {
      setSwitchingConnection(false);
    }
  };

  const headerSx = {
    flexShrink: 0,
    color: 'var(--text-color)',
    pb: 1.5,
    mb: 2,
    borderBottom: '1px solid var(--border-color)',
  };

  if (adding) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Typography variant="h6" component="h2" sx={headerSx}>
          Add database connection
        </Typography>
        {/* AddConnectionForm manages its own internal scroll (fields) vs.
            fixed footer (Cancel/Connect) split -- this just sizes the space
            it fills, it must not scroll itself or the footer would scroll
            away again. */}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <AddConnectionForm onDone={() => setAdding(false)} />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Typography variant="h6" component="h2" sx={headerSx}>
        Database Connections
      </Typography>

      {/* Rows carry no border of their own -- a bottom hairline between
          rows (same convention as PreferencesSection's ToggleRow) instead
          of each one boxed like a card. The active connection is marked by
          tinting the whole row, the same left-accent-plus-background
          treatment the settings rail itself uses for its active section --
          not a standalone checkmark icon competing for attention against
          the MCP switch and delete icon already in the row. Only this row
          list scrolls -- the title above and "+ Add" button below stay put. */}
      <Box className="styled-scrollbar" sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {global.connections.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No saved connections yet.
          </Typography>
        )}
        {global.connections.map(({ id, label, mcpEnabled }) => {
          const isActive = isDesktop() ? id === global.activeProfileId : id === activeSession?.connectionId;
          const isLive = global.isConnectionLive(id);
          return (
            <Box
              key={id}
              onClick={() => !switchingConnection && !removingId && handleSwitchTo(id)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 1,
                borderLeft: isActive ? '2px solid var(--primary-color)' : '2px solid transparent',
                borderBottom: '1px solid var(--border-color)',
                backgroundColor: isActive ? 'var(--node-column-bg)' : 'transparent',
                cursor: switchingConnection || removingId ? 'default' : 'pointer',
                opacity: switchingConnection || removingId ? 0.6 : 1,
                '&:hover': { backgroundColor: 'var(--node-column-bg)' },
              }}
            >
              <Box
                title={isLive ? undefined : 'Not connected yet'}
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  boxSizing: 'border-box',
                  backgroundColor: isLive ? global.getConnectionColor(id) || 'var(--border-color)' : 'transparent',
                  border: isLive ? 'none' : `1.5px solid ${global.getConnectionColor(id) || 'var(--border-color)'}`,
                }}
              />
              <Typography
                component="span"
                variant="body2"
                title={isActive ? 'Active connection' : undefined}
                sx={{ flex: 1, fontFamily: 'var(--canvas-font)', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {label}
              </Typography>
              {isDesktop() && (
                <Box
                  onClick={e => e.stopPropagation()}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                  title={mcpEnabled ? 'Enabled for MCP access' : 'Enable for MCP access'}
                >
                  <Switch
                    size="small"
                    checked={!!mcpEnabled}
                    onChange={(_e, checked) => global.setMcpEnabled(id, checked)}
                  />
                </Box>
              )}
              {!isPlayground() && (
                <DeleteOutlineIcon
                  onClick={e => handleRemoveClick(e, id)}
                  titleAccess={confirmingRemoveId === id ? 'Click again to remove' : 'Remove connection'}
                  sx={{
                    fontSize: 16,
                    cursor: 'pointer',
                    opacity: confirmingRemoveId === id ? 1 : 0.35,
                    color: confirmingRemoveId === id ? 'var(--text-warning-color)' : 'inherit',
                    '&:hover': { opacity: 0.9 },
                  }}
                />
              )}
            </Box>
          );
        })}
      </Box>

      <Button
        variant="outlined"
        onClick={() => setAdding(true)}
        sx={{
          flexShrink: 0,
          mt: 2,
          borderColor: 'var(--border-color)',
          color: 'var(--text-color)',
          '&:hover': { borderColor: 'var(--primary-color)', backgroundColor: 'var(--node-column-bg)' },
        }}
      >
        + Add database connection
      </Button>
    </Box>
  );
};

export default observer(ConnectionsSection);
