import CheckIcon from '@mui/icons-material/Check';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
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
  Popover,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { useStores } from '../../store/store-container';
import { CONNECTION_COLOR_PALETTE, isDesktop, isPlayground } from '../../store/util';
import { DecryptionFailedError } from '../../store/global.store';
import { parseConnectionString } from '../../utils/connectionString';
import ToggleRow from './ToggleRow';

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
  // Desktop-only: browser mode has nowhere to persist a custom name (see
  // ConnectionsSection's rename affordance below), so there's nothing for
  // this field to do there.
  const [label, setLabel] = useState('');
  const [connectionString, setConnectionString] = useState('');
  const [connectionStringError, setConnectionStringError] = useState('');
  const [showConnectionString, setShowConnectionString] = useState(false);
  const [mode, setMode] = useState<'fields' | 'string'>('fields');
  const [error, setError] = useState(
    reconnectHint
      ? "Couldn't unlock the saved password for this connection — please re-enter it."
      : '',
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
        label: label.trim() || undefined,
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

        {isDesktop() && (
          <TextField
            fullWidth
            margin="dense"
            label="Connection name"
            id="db-label"
            name="label"
            autoComplete="off"
            placeholder="e.g. Production orders"
            helperText="Optional -- defaults to the username@host:port/database if left blank."
            value={label}
            onChange={e => setLabel(e.target.value)}
            disabled={connected}
            sx={{ ...fieldSx, mb: 1 }}
          />
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
                      aria-label={
                        showConnectionString ? 'Hide connection string' : 'Show connection string'
                      }
                      onClick={() => setShowConnectionString(show => !show)}
                      edge="end"
                      size="small"
                      sx={{ color: 'var(--icon-color)' }}
                    >
                      {showConnectionString ? (
                        <VisibilityOff fontSize="small" />
                      ) : (
                        <Visibility fontSize="small" />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            sx={fieldSx}
          />
        )}
      </Box>

      <Box
        sx={{
          flexShrink: 0,
          mt: 2,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          justifyContent: 'space-between',
        }}
      >
        <Button
          type="button"
          variant="outlined"
          onClick={onDone}
          sx={{
            borderColor: 'var(--border-color)',
            color: 'var(--text-color)',
            '&:hover': {
              borderColor: 'var(--primary-color)',
              backgroundColor: 'var(--node-column-bg)',
            },
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
  );
};

/**
 * One saved connection: a collapsed row (switch active, recolor, a quick
 * "MCP" badge when it's on) plus, for desktop only, an expandable panel
 * holding everything else -- rename, access policy, MCP access, the
 * apply-to-own-queries exception, refresh, and delete. Those five used to
 * all live as icons/popovers on the collapsed row at once, which made the
 * relationship between "MCP access" and "access policy" (MCP can only be on
 * once a policy with an active rule is assigned) hard to read at a glance.
 * Laid out top-to-bottom here in that same dependency order instead: pick a
 * policy, then turn MCP on.
 *
 * Browser/playground mode never had this problem -- no MCP or policy
 * concept there at all -- so it keeps the old flat row (color, name,
 * refresh, delete) unchanged rather than gaining an expand affordance with
 * nothing worth hiding behind it.
 */
const ConnectionRow = observer(
  ({
    id,
    label,
    mcpEnabled,
    policyId,
    bypassPolicyForOwnQueries,
    isActive,
    isLive,
    switchDisabled,
    onSwitch,
  }: {
    id: string;
    label: string;
    mcpEnabled?: boolean;
    policyId?: string | null;
    bypassPolicyForOwnQueries?: boolean;
    isActive: boolean;
    isLive: boolean;
    switchDisabled: boolean;
    onSwitch: () => void;
  }) => {
    const { global } = useStores();
    const desktop = isDesktop();
    const [expanded, setExpanded] = useState(false);
    const [confirmingRemove, setConfirmingRemove] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [reindexing, setReindexing] = useState(false);
    const [reindexed, setReindexed] = useState(false);
    const [renameValue, setRenameValue] = useState(label);
    const [renameSaving, setRenameSaving] = useState(false);
    const [colorPickerAnchor, setColorPickerAnchor] = useState<HTMLElement | null>(null);
    const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reindexedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Keeps the draft in sync with a rename committed elsewhere (there's no
    // other UI that renames a connection today, but this is what a future
    // one would need to not be silently overwritten on this row's next edit).
    useEffect(() => setRenameValue(label), [label]);

    useEffect(() => {
      return () => {
        if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
        if (reindexedTimeoutRef.current) clearTimeout(reindexedTimeoutRef.current);
      };
    }, []);

    const commitRename = async () => {
      const trimmed = renameValue.trim();
      if (!trimmed) {
        setRenameValue(label);
        return;
      }
      if (trimmed === label) return;
      setRenameSaving(true);
      try {
        await global.renameConnection(id, trimmed);
      } catch {
        // Failure is already surfaced via the global connection-error snackbar.
      } finally {
        setRenameSaving(false);
      }
    };

    const handleReindexClick = () => {
      if (reindexing) return;
      setReindexing(true);
      global
        .reindexConnection(id)
        .then(() => {
          setReindexed(true);
          reindexedTimeoutRef.current = setTimeout(() => setReindexed(false), 1500);
        })
        .catch(() => {
          // Failure is already surfaced via the global connection-error snackbar.
        })
        .finally(() => setReindexing(false));
    };

    const handleRemoveClick = () => {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
        confirmTimeoutRef.current = null;
      }
      if (confirmingRemove) {
        setConfirmingRemove(false);
        setRemoving(true);
        global.deleteConnection(id).finally(() => setRemoving(false));
        return;
      }
      setConfirmingRemove(true);
      confirmTimeoutRef.current = setTimeout(
        () => setConfirmingRemove(false),
        REMOVE_CONFIRM_TIMEOUT_MS,
      );
    };

    const selectedPolicy = global.accessPolicies.find(p => p.id === policyId);
    // MCP always uses this connection's own assigned policy the moment it's
    // enabled -- there is no "on but undecided" state (setMcpEnabled
    // refuses turning it on otherwise). policyId === null is "None", a
    // deliberate choice of unrestricted access (e.g. a local/sandbox DB),
    // not a missing policy -- it counts as decided same as an active one.
    const isConnPolicyActive = policyId == null ? true : !!selectedPolicy?.rules.some(m => m.enabled);
    // Only refuse *turning on* -- switching an already-enabled connection
    // off must never be blocked by its policy going inactive later; that's
    // a separate, always-available action (see GlobalStore.setMcpEnabled,
    // which only ever refuses an `enabled: true` call).
    const mcpToggleDisabled = !mcpEnabled && !isConnPolicyActive;
    const disabledWhileBusy = switchDisabled || removing;

    return (
      <Box
        sx={{
          minWidth: 0,
          borderBottom: '1px solid var(--border-color)',
          opacity: disabledWhileBusy ? 0.6 : 1,
        }}
      >
        <Box
          onClick={() => !disabledWhileBusy && onSwitch()}
          // A real Tab stop for the row's own primary action (switch to
          // this connection, same as a click).
          tabIndex={disabledWhileBusy ? -1 : 0}
          role="button"
          aria-label={`Switch to connection ${label}`}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabledWhileBusy) {
              e.preventDefault();
              onSwitch();
            }
          }}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: 0,
            px: 1.5,
            py: 1,
            borderLeft: isActive ? '2px solid var(--primary-color)' : '2px solid transparent',
            backgroundColor: isActive ? 'var(--node-column-bg)' : 'transparent',
            cursor: disabledWhileBusy ? 'default' : 'pointer',
            outline: 'none',
            '&:focus-visible': {
              outline: '2px solid var(--primary-color)',
              outlineOffset: '-2px',
            },
            '&:hover': { backgroundColor: 'var(--node-column-bg)' },
          }}
        >
          <Box
            title={isLive ? 'Click to change color' : 'Not connected yet -- click to change color'}
            onClick={e => {
              e.stopPropagation();
              setColorPickerAnchor(e.currentTarget);
            }}
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              boxSizing: 'border-box',
              cursor: 'pointer',
              backgroundColor: isLive
                ? global.getConnectionColor(id) || 'var(--border-color)'
                : 'transparent',
              border: isLive
                ? 'none'
                : `1.5px solid ${global.getConnectionColor(id) || 'var(--border-color)'}`,
              transition: 'opacity 0.15s',
              '&:hover': { opacity: 0.7 },
            }}
          />
          {colorPickerAnchor && (
            <Popover
              open
              anchorEl={colorPickerAnchor}
              onClose={() => setColorPickerAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              slotProps={{
                paper: {
                  onClick: (e: MouseEvent) => e.stopPropagation(),
                  sx: {
                    backgroundColor: 'var(--background-color)',
                    backgroundImage: 'none',
                    border: '1px solid var(--border-color)',
                    borderRadius: 1,
                    p: 0.75,
                    display: 'flex',
                    gap: 0.75,
                  },
                },
              }}
            >
              {CONNECTION_COLOR_PALETTE.map(color => (
                <Box
                  key={color}
                  onClick={() => {
                    global.setConnectionColor(id, color);
                    setColorPickerAnchor(null);
                  }}
                  sx={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    backgroundColor: color,
                    cursor: 'pointer',
                    border:
                      color === global.getConnectionColor(id)
                        ? '2px solid var(--text-color)'
                        : '2px solid transparent',
                    transition: 'transform 0.1s',
                    '&:hover': { transform: 'scale(1.25)' },
                  }}
                />
              ))}
            </Popover>
          )}
          {desktop && expanded ? (
            <TextField
              autoFocus
              variant="standard"
              size="small"
              value={renameValue}
              disabled={renameSaving}
              onClick={e => e.stopPropagation()}
              onFocus={e => e.target.select()}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === 'Escape') {
                  setRenameValue(label);
                }
              }}
              sx={{
                flex: 1,
                minWidth: 0,
                // A long saved hostname (e.g. a full connection string) must
                // not push this field wider than the row -- MUI nests a
                // couple of flex layers between the TextField root and the
                // actual <input>, and each one needs its own min-width: 0
                // or the outermost one alone doesn't let the real overflow
                // culprit (the input's own intrinsic content width) shrink.
                '& .MuiInputBase-root': { minWidth: 0 },
                '& .MuiInput-input': {
                  minWidth: 0,
                  py: 0,
                  fontFamily: 'var(--canvas-font)',
                  // Fixed px, not rem -- see SettingsModal.tsx's
                  // settingsTheme comment.
                  fontSize: '14px',
                  color: 'var(--text-color)',
                },
                '& .MuiInput-underline:before': { borderBottomColor: 'var(--border-color)' },
              }}
            />
          ) : (
            <Typography
              component="span"
              variant="body2"
              title={isActive ? 'Active connection' : undefined}
              sx={{
                flex: 1,
                minWidth: 0,
                fontFamily: 'var(--canvas-font)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </Typography>
          )}
          {desktop && mcpEnabled && !expanded && (
            <Box
              title="MCP access is on -- an AI agent can query this connection"
              sx={{
                fontSize: 10,
                fontFamily: 'var(--canvas-font)',
                letterSpacing: '0.02em',
                color: 'var(--icon-color-highlight)',
                border: '1px solid var(--icon-color-highlight)',
                borderRadius: '3px',
                px: 0.5,
                py: '1px',
                flexShrink: 0,
              }}
            >
              MCP
            </Box>
          )}
          {desktop ? (
            <IconButton
              size="small"
              onClick={e => {
                e.stopPropagation();
                setExpanded(v => !v);
              }}
              aria-label={expanded ? 'Hide connection settings' : 'Show connection settings'}
              aria-expanded={expanded}
              sx={{
                p: 0.25,
                color: 'var(--icon-color)',
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s',
              }}
            >
              <ExpandMoreIcon sx={{ fontSize: 18 }} />
            </IconButton>
          ) : (
            <>
              {/* Fixed-width slot, always rendered (even for a not-yet-live
                  connection, where it's simply empty) -- so the delete icon
                  after it lands in the same column on every row instead of
                  shifting over depending on whether this one has a refresh
                  icon to show. */}
              <Box sx={{ width: 16, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                {isLive &&
                  (reindexed ? (
                    <CheckIcon sx={{ fontSize: 16, color: 'var(--icon-color-highlight)' }} />
                  ) : (
                    <RefreshIcon
                      onClick={e => {
                        e.stopPropagation();
                        handleReindexClick();
                      }}
                      titleAccess="Refresh schema — pick up tables or columns added since this connection last loaded them"
                      sx={{
                        fontSize: 16,
                        cursor: reindexing ? 'default' : 'pointer',
                        opacity: reindexing ? 0.7 : 0.35,
                        '&:hover': { opacity: reindexing ? undefined : 0.9 },
                        '@keyframes pine-reindex-spin': {
                          from: { transform: 'rotate(0deg)' },
                          to: { transform: 'rotate(360deg)' },
                        },
                        animation: reindexing ? 'pine-reindex-spin 0.8s linear infinite' : 'none',
                      }}
                    />
                  ))}
              </Box>
              {!isPlayground() && (
                <DeleteOutlineIcon
                  onClick={e => {
                    e.stopPropagation();
                    handleRemoveClick();
                  }}
                  titleAccess={confirmingRemove ? 'Click again to remove' : 'Remove connection'}
                  sx={{
                    fontSize: 16,
                    cursor: 'pointer',
                    opacity: confirmingRemove ? 1 : 0.35,
                    color: confirmingRemove ? 'var(--text-warning-color)' : 'inherit',
                    '&:hover': { opacity: 0.9 },
                  }}
                />
              )}
            </>
          )}
        </Box>

        {desktop && expanded && (
          <Box
            sx={{
              minWidth: 0,
              boxSizing: 'border-box',
              width: '100%',
              px: 1.5,
              pt: 2.5,
              pb: 2,
              pl: 3.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            <TextField
              select
              fullWidth
              size="small"
              label="Access policy"
              value={policyId ?? '__none__'}
              onChange={e => {
                const value = e.target.value === '__none__' ? null : e.target.value;
                global.setConnectionPolicy(id, value);
              }}
              helperText={
                selectedPolicy && !isConnPolicyActive
                  ? `"${selectedPolicy.name}" has no active rules -- add one in Settings -> Access Policy, or MCP can't turn on.`
                  : policyId == null
                    ? 'No redaction -- MCP and your own queries see full, unrestricted data on this connection.'
                    : 'Redacts columns per the selected policy. MCP access below requires one with an active rule.'
              }
              sx={{ ...fieldSx, minWidth: 0 }}
            >
              <MenuItem value="__none__">None</MenuItem>
              {global.accessPolicies.map(p => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                  {!p.rules.some(m => m.enabled) ? ' (no active rules)' : ''}
                </MenuItem>
              ))}
            </TextField>

            <ToggleRow
              label="MCP access"
              description="Let an AI agent query this connection over MCP."
              checked={!!mcpEnabled}
              onChange={value => global.setMcpEnabled(id, value)}
              disabled={mcpToggleDisabled}
            />

            <ToggleRow
              label="Only apply to MCP server"
              description="When on, this policy protects the agent only -- your own queries on this connection show real data instead."
              checked={!!bypassPolicyForOwnQueries}
              onChange={value => global.setBypassPolicyForOwnQueries(id, value)}
              disabled={!policyId}
            />

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={
                  reindexed ? (
                    <CheckIcon sx={{ fontSize: 16, color: 'var(--icon-color-highlight)' }} />
                  ) : (
                    <RefreshIcon
                      sx={{
                        fontSize: 16,
                        '@keyframes pine-reindex-spin': {
                          from: { transform: 'rotate(0deg)' },
                          to: { transform: 'rotate(360deg)' },
                        },
                        animation: reindexing ? 'pine-reindex-spin 0.8s linear infinite' : 'none',
                      }}
                    />
                  )
                }
                disabled={!isLive || reindexing}
                onClick={handleReindexClick}
                title="Pick up tables or columns added since this connection last loaded them"
                sx={{
                  whiteSpace: 'nowrap',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-color)',
                  '&:hover': {
                    borderColor: 'var(--primary-color)',
                    backgroundColor: 'var(--node-column-bg)',
                  },
                }}
              >
                Refresh schema
              </Button>
              {!isPlayground() && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />}
                  onClick={handleRemoveClick}
                  sx={{
                    whiteSpace: 'nowrap',
                    borderColor: confirmingRemove
                      ? 'var(--text-warning-color)'
                      : 'var(--border-color)',
                    color: confirmingRemove ? 'var(--text-warning-color)' : 'var(--text-color)',
                    '&:hover': {
                      borderColor: 'var(--text-warning-color)',
                      backgroundColor: 'var(--node-column-bg)',
                    },
                  }}
                >
                  {confirmingRemove ? 'Click again to delete' : 'Delete connection'}
                </Button>
              )}
            </Box>
          </Box>
        )}
      </Box>
    );
  },
);

/**
 * The Connections settings section: a list of saved connections (switch
 * active, rename, recolor, toggle MCP access, delete) plus an "add
 * connection" sub-view. Absorbs what used to be pages/settings.tsx (the add
 * form) and the connection-management half of ActiveConnection.tsx's
 * dropdown menu -- that dropdown is now just a quick switcher, see
 * ActiveConnection.tsx.
 */
const ConnectionsSection = () => {
  const { global } = useStores();
  const [adding, setAdding] = useState(
    () => !!global.reconnectHint || global.consumeSettingsConnectionsAdding(),
  );
  const [switchingConnection, setSwitchingConnection] = useState(false);

  const activeSession = global.sessions[global.activeSessionId];

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
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      <Typography variant="h6" component="h2" sx={headerSx}>
        Database Connections
      </Typography>

      {/* Rows carry no border of their own -- a bottom hairline between
          rows (same convention as PreferencesSection's ToggleRow) instead
          of each one boxed like a card. The active connection is marked by
          tinting the whole row, the same left-accent-plus-background
          treatment the settings rail itself uses for its active section.
          Only this row list scrolls -- the title above and "+ Add" button
          below stay put. */}
      <Box className="styled-scrollbar" sx={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto' }}>
        {global.connections.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No saved connections yet.
          </Typography>
        )}
        {global.connections.map(
          ({ id, label, mcpEnabled, policyId, bypassPolicyForOwnQueries }) => {
            const isActive = isDesktop()
              ? id === global.activeProfileId
              : id === activeSession?.connectionId;
            const isLive = global.isConnectionLive(id);
            return (
              <ConnectionRow
                key={id}
                id={id}
                label={label}
                mcpEnabled={mcpEnabled}
                policyId={policyId}
                bypassPolicyForOwnQueries={bypassPolicyForOwnQueries}
                isActive={isActive}
                isLive={isLive}
                switchDisabled={switchingConnection}
                onSwitch={() => handleSwitchTo(id)}
              />
            );
          },
        )}
      </Box>

      <Button
        variant="outlined"
        onClick={() => setAdding(true)}
        sx={{
          flexShrink: 0,
          mt: 2,
          borderColor: 'var(--border-color)',
          color: 'var(--text-color)',
          '&:hover': {
            borderColor: 'var(--primary-color)',
            backgroundColor: 'var(--node-column-bg)',
          },
        }}
      >
        + Add database connection
      </Button>
    </Box>
  );
};

export default observer(ConnectionsSection);
