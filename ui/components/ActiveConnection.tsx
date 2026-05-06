import { Box, ClickAwayListener, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { useStores } from '../store/store-container';
import { CONNECTION_COLOR_PALETTE } from '../store/util';
import Settings from '../pages/settings';

const ActiveConnection = () => {
  const { global } = useStores();
  const [showColorPicker, setShowColorPicker] = useState(false);

  const activeSession = global.sessions[global.activeSessionId];
  const connectionId = activeSession?.connectionId || global.connection;
  const connectionColor = global.getConnectionColor(connectionId);
  const isDbConnected = !!connectionId;

  useEffect(() => {
    if (global.pineConnected && !isDbConnected) {
      global.setShowSettings(true);
    }
  }, [global.pineConnected, isDbConnected]);

  const serverVersion = global.version ?? 'obsolete';
  const displayName = connectionId
    ? connectionId.length > 24
      ? connectionId.substring(0, 24) + '...'
      : connectionId
    : 'Not connected to database';
  const displayText = global.pineConnected
    ? `[${serverVersion}] ${displayName}`
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
                      border: color === connectionColor
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
          onClick: () => global.setShowSettings(!global.showSettings),
          style: { cursor: 'pointer' },
        })}
      >
        {displayText}
      </Typography>
    </Box>
  );
};

export default observer(ActiveConnection);
