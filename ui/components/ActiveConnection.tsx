import CheckIcon from '@mui/icons-material/Check';
import { Box, ClickAwayListener, Divider, Menu, MenuItem, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useState, type MouseEvent } from 'react';
import { useStores } from '../store/store-container';
import { CONNECTION_COLOR_PALETTE } from '../store/util';
import Settings from '../pages/settings';

const ActiveConnection = () => {
  const { global } = useStores();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [connectionMenuAnchor, setConnectionMenuAnchor] = useState<null | HTMLElement>(null);
  const [switchingConnection, setSwitchingConnection] = useState(false);

  const activeSession = global.sessions[global.activeSessionId];
  const connectionId = activeSession?.connectionId || global.connection;
  const connectionColor = global.getConnectionColor(connectionId);
  const isDbConnected = !!connectionId;

  useEffect(() => {
    if (global.pineConnected && !isDbConnected) {
      global.setShowSettings(true);
    }
  }, [global, global.pineConnected, isDbConnected]);

  const connectionLabel = connectionId ? global.getConnectionLabel(connectionId) : '';
  const displayName = connectionId
    ? connectionLabel.length > 24
      ? connectionLabel.substring(0, 24) + '...'
      : connectionLabel
    : 'Not connected to database';
  const displayText = global.pineConnected
    ? `${status} ${displayName}`
    : '🔌 No connection to Pine server!';

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
                backgroundColor: connectionColor,
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
        color="gray"
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
        onClose={() => setConnectionMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              minWidth: 260,
              maxHeight: 320,
              bgcolor: 'var(--background-color)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-color)',
            },
          },
        }}
      >
        {global.connections.map(({ id, label }) => (
          <MenuItem
            key={id}
            selected={id === activeSession?.connectionId}
            disabled={switchingConnection}
            onClick={async () => {
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
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                flexShrink: 0,
                backgroundColor: global.getConnectionColor(id) || 'var(--border-color)',
              }}
            />
            <Typography
              component="span"
              variant="body2"
              sx={{
                flex: 1,
                fontSize: '0.75rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {label}
            </Typography>
            {id === activeSession?.connectionId ? (
              <CheckIcon sx={{ fontSize: 16, opacity: 0.7, flexShrink: 0 }} />
            ) : (
              <Box sx={{ width: 16, flexShrink: 0 }} />
            )}
          </MenuItem>
        ))}
        {global.connections.length > 0 ? (
          <Divider sx={{ borderColor: 'var(--border-color)' }} />
        ) : null}
        <MenuItem
          disabled={switchingConnection}
          onClick={() => {
            global.setShowSettings(true);
            setConnectionMenuAnchor(null);
          }}
          sx={{ fontSize: '0.85rem' }}
        >
          Add new connection…
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default observer(ActiveConnection);
