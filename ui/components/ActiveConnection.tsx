import CheckIcon from '@mui/icons-material/Check';
import { Box, Divider, Menu, MenuItem, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useState, type MouseEvent } from 'react';
import { useStores } from '../store/store-container';
import { isDesktop } from '../store/util';
import { DecryptionFailedError } from '../store/global.store';

/**
 * A quick connection switcher -- click the label, pick a connection, done.
 * Connection *management* (add/delete/MCP access/color) lives in the Settings
 * modal's Connections section (see components/settings/ConnectionsSection.tsx)
 * now, not here; this dropdown used to also carry that plus an "MCP setup
 * instructions…" entry, which read as out of place in a menu whose header
 * is just "pick a connection" -- "Manage database connections…" below opens Settings
 * instead of duplicating that UI in two places.
 */
const ActiveConnection = () => {
  const { global } = useStores();
  const [connectionMenuAnchor, setConnectionMenuAnchor] = useState<null | HTMLElement>(null);
  const [switchingConnection, setSwitchingConnection] = useState(false);

  const activeSession = global.sessions[global.activeSessionId];
  const connectionId = activeSession?.connectionId || '';
  const connectionColor = global.getConnectionColor(connectionId);
  const isConnectionLive = global.isConnectionLive(connectionId);

  // No auto-popup here: a disconnected tab's own connection (if it has one)
  // is reconnected lazily and silently by GlobalStore's activeSessionId/
  // pineConnected reactions (see ensureSessionConnected). Forcing a modal
  // open on every tab that happens to not be live yet is exactly the bad
  // UX this replaced -- connecting is now automatic, and the connections
  // picker/settings stay available only as a manual click.

  const connectionLabel = connectionId ? global.getConnectionLabel(connectionId) : '';
  const truncatedLabel =
    connectionLabel.length > 24 ? connectionLabel.substring(0, 24) + '...' : connectionLabel;
  const displayName = !connectionId
    ? 'Not connected to database'
    : activeSession?.connecting
      ? `${truncatedLabel} (connecting…)`
      : isConnectionLive
        ? truncatedLabel
        : `${truncatedLabel} (not connected)`;

  const displayText = global.pineConnected ? displayName : '🔌 No connection to Pine server!';

  const handleSwitchTo = async (id: string) => {
    if (isDesktop()) {
      if (id === global.activeProfileId) {
        setConnectionMenuAnchor(null);
        return;
      }
      setSwitchingConnection(true);
      try {
        await global.connectToSavedProfile(id);
      } catch (e) {
        // A saved profile may not have a live pool yet this session (or, on
        // decryption failure, opening Settings lets the user re-enter just
        // the password) -- either way there's nothing more to do here;
        // connectToSavedProfile/connect already surface the failure via
        // global.connectionError (see ConnectionErrorSnackbar).
        if (e instanceof DecryptionFailedError) {
          global.setShowSettings(true, 'connections');
        }
      } finally {
        setSwitchingConnection(false);
        setConnectionMenuAnchor(null);
      }
      return;
    }
    if (activeSession && id === activeSession.connectionId && id === global.connection) {
      setConnectionMenuAnchor(null);
      return;
    }
    setSwitchingConnection(true);
    try {
      await global.selectConnection(id);
    } finally {
      setSwitchingConnection(false);
      setConnectionMenuAnchor(null);
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      {connectionId && (
        <Box
          title="Change this connection's color in Settings"
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            // Solid once the connection actually has a live pool;
            // outline-only while it's just this tab's assigned
            // connection but not connected yet (or currently
            // reconnecting) -- same color either way, so it's still
            // obvious which connection this is.
            backgroundColor: isConnectionLive ? connectionColor : 'transparent',
            border: isConnectionLive ? 'none' : `1.5px solid ${connectionColor || 'var(--border-color)'}`,
            boxSizing: 'border-box',
            flexShrink: 0,
          }}
        />
      )}
      <Typography
        variant="caption"
        component="code"
        sx={{ color: 'var(--canvas-text-dim)', fontFamily: 'var(--canvas-font)' }}
        {...(global.pineConnected && {
          onClick: (e: MouseEvent<HTMLElement>) => {
            setConnectionMenuAnchor(e.currentTarget);
          },
          style: { cursor: 'pointer' },
        })}
      >
        {displayText}
      </Typography>
      <Menu
        anchorEl={connectionMenuAnchor}
        open={Boolean(connectionMenuAnchor)}
        onClose={() => setConnectionMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              minWidth: 260,
              maxHeight: 320,
              bgcolor: 'var(--background-color)',
              // MUI's Paper applies a dark-mode "elevation overlay" (a
              // semi-transparent white gradient, opacity scaling with
              // elevation) by default - confirmed live that it rendered
              // this menu visibly lighter than the rest of the app's plain
              // Box surfaces, even though both set the exact same
              // background token. Suppressed so they actually match.
              backgroundImage: 'none',
              border: '1px solid var(--border-color)',
              color: 'var(--text-color)',
            },
          },
        }}
      >
        {global.connections.map(({ id, label }) => (
          <MenuItem
            key={id}
            selected={isDesktop() ? id === global.activeProfileId : id === activeSession?.connectionId}
            disabled={switchingConnection}
            onClick={() => handleSwitchTo(id)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              fontFamily: 'inherit',
              fontSize: '0.8rem',
            }}
          >
            <Box
              title={global.isConnectionLive(id) ? undefined : 'Not connected yet'}
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                flexShrink: 0,
                boxSizing: 'border-box',
                backgroundColor: global.isConnectionLive(id)
                  ? global.getConnectionColor(id) || 'var(--border-color)'
                  : 'transparent',
                border: global.isConnectionLive(id)
                  ? 'none'
                  : `1.5px solid ${global.getConnectionColor(id) || 'var(--border-color)'}`,
              }}
            />
            <Typography
              component="span"
              variant="body2"
              sx={{
                flex: 1,
                fontSize: '0.75rem',
                fontFamily: 'var(--canvas-font)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {label}
            </Typography>
            {(isDesktop() ? id === global.activeProfileId : id === activeSession?.connectionId) && (
              <CheckIcon sx={{ fontSize: 16, opacity: 0.7 }} />
            )}
          </MenuItem>
        ))}
        {global.connections.length > 0 ? (
          <Divider sx={{ borderColor: 'var(--border-color)' }} />
        ) : null}
        <MenuItem
          onClick={() => {
            global.setShowSettings(true, 'connections');
            setConnectionMenuAnchor(null);
          }}
          sx={{ fontSize: '0.85rem', fontFamily: 'var(--canvas-font)' }}
        >
          Manage database connections…
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default observer(ActiveConnection);
