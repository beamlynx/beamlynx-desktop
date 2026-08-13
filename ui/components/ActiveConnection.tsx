import CheckIcon from '@mui/icons-material/Check';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { Box, ClickAwayListener, Divider, Menu, MenuItem, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useStores } from '../store/store-container';
import { CONNECTION_COLOR_PALETTE, isDesktop, isPlayground } from '../store/util';
import { DecryptionFailedError } from '../store/global.store';
import Settings from '../pages/settings';

const REMOVE_CONFIRM_TIMEOUT_MS = 3000;

const ActiveConnection = () => {
  const { global } = useStores();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [connectionMenuAnchor, setConnectionMenuAnchor] = useState<null | HTMLElement>(null);
  const [switchingConnection, setSwitchingConnection] = useState(false);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConfirmTimeout = () => {
    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
  };

  useEffect(() => clearConfirmTimeout, []);

  const activeSession = global.sessions[global.activeSessionId];
  const connectionId = activeSession?.connectionId || '';
  const connectionColor = global.getConnectionColor(connectionId);
  const isConnectionLive = global.isConnectionLive(connectionId);

  const handleRemoveClick = (e: MouseEvent<SVGSVGElement>, id: string) => {
    e.stopPropagation();
    clearConfirmTimeout();
    if (confirmingRemoveId === id) {
      setConfirmingRemoveId(null);
      setRemovingId(id);
      const wasActive = id === (activeSession?.connectionId || global.connection);
      global.deleteConnection(id).finally(() => {
        setRemovingId(null);
        // Removing the active connection triggers the "Database Connection" modal
        // to auto-open (see the effect below) — close the picker menu so it
        // doesn't sit open behind/alongside that modal.
        if (wasActive) {
          setConnectionMenuAnchor(null);
        }
      });
      return;
    }
    setConfirmingRemoveId(id);
    confirmTimeoutRef.current = setTimeout(() => setConfirmingRemoveId(null), REMOVE_CONFIRM_TIMEOUT_MS);
  };

  // No auto-popup here: a disconnected tab's own connection (if it has one)
  // is reconnected lazily and silently by GlobalStore's activeSessionId/
  // pineConnected reactions (see ensureSessionConnected). Forcing a modal
  // open on every tab that happens to not be live yet is exactly the bad
  // UX this replaced -- connecting is now automatic, and the connections
  // picker/settings form stay available only as a manual click (the label
  // below, or the "Add new connection…" menu item).

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

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      {global.showSettings && <Settings />}
      {connectionId && (
        <ClickAwayListener onClickAway={() => setShowColorPicker(false)}>
          <Box sx={{ position: 'relative' }}>
            <Box
              onClick={() => setShowColorPicker(v => !v)}
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
                cursor: 'pointer',
                transition: 'opacity 0.15s',
                '&:hover': { opacity: 0.75 },
              }}
            />
            {showColorPicker && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 14,
                  left: 0,
                  zIndex: 1000,
                  backgroundColor: 'var(--background-color)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 1,
                  p: 0.75,
                  display: 'flex',
                  gap: 0.75,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}
              >
                {CONNECTION_COLOR_PALETTE.map(color => (
                  <Box
                    key={color}
                    onClick={() => {
                      global.setConnectionColor(connectionId, color);
                      setShowColorPicker(false);
                    }}
                    sx={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      backgroundColor: color,
                      cursor: 'pointer',
                      border:
                        color === connectionColor
                          ? '2px solid var(--text-color)'
                          : '2px solid transparent',
                      transition: 'transform 0.1s',
                      '&:hover': { transform: 'scale(1.25)' },
                    }}
                  />
                ))}
              </Box>
            )}
          </Box>
        </ClickAwayListener>
      )}
      <Typography
        variant="caption"
        component="code"
        sx={{ color: 'var(--canvas-text-dim)', fontFamily: 'var(--canvas-font)' }}
        {...(global.pineConnected && {
          onClick: (e: MouseEvent<HTMLElement>) => {
            setShowColorPicker(false);
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
        onClose={() => {
          setConnectionMenuAnchor(null);
          clearConfirmTimeout();
          setConfirmingRemoveId(null);
        }}
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
              // this menu visibly lighter than ConnectionsListModal.tsx's
              // plain Box, even though both set the exact same background
              // token. Suppressed so the two connection UIs actually match.
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
            disabled={switchingConnection || !!removingId}
            onClick={async () => {
              console.log(
                `[credentials] connection item clicked: id=${id} isDesktop()=${isDesktop()} activeProfileId=${global.activeProfileId}`,
              );
              if (isDesktop()) {
                if (id === global.activeProfileId) {
                  console.log('[credentials] click: already the active profile, no-op');
                  setConnectionMenuAnchor(null);
                  return;
                }
                setSwitchingConnection(true);
                try {
                  await global.connectToSavedProfile(id);
                } catch (e) {
                  // A saved profile may not have a live pool yet this session
                  // (or, on decryption failure, opening Settings lets the
                  // user re-enter just the password) -- either way there's
                  // nothing more to do here; connectToSavedProfile/connect
                  // already surface the failure via global.connectionError
                  // (see ConnectionErrorSnackbar).
                  console.error('[credentials] click: connectToSavedProfile threw ->', e);
                  if (e instanceof DecryptionFailedError) {
                    global.setShowSettings(true);
                  }
                } finally {
                  setSwitchingConnection(false);
                  setConnectionMenuAnchor(null);
                }
                return;
              }
              if (activeSession && id === activeSession.connectionId && id === global.connection) {
                console.log('[credentials] click: already the active session (browser mode), no-op');
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
            }}
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              {(isDesktop() ? id === global.activeProfileId : id === activeSession?.connectionId) ? (
                <CheckIcon sx={{ fontSize: 16, opacity: 0.7 }} />
              ) : (
                <Box sx={{ width: 16 }} />
              )}
              {isPlayground() ? (
                <Box sx={{ width: 16 }} />
              ) : (
                <DeleteOutlineIcon
                  onClick={e => handleRemoveClick(e, id)}
                  titleAccess={
                    confirmingRemoveId === id ? 'Click again to remove' : 'Remove connection'
                  }
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
          </MenuItem>
        ))}
        {global.connections.length > 0 ? (
          <Divider sx={{ borderColor: 'var(--border-color)' }} />
        ) : null}
        <MenuItem
          disabled={switchingConnection || !!removingId}
          onClick={() => {
            global.setShowSettings(true);
            setConnectionMenuAnchor(null);
          }}
          sx={{ fontSize: '0.85rem', fontFamily: 'var(--canvas-font)' }}
        >
          Add new connection…
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default observer(ActiveConnection);
