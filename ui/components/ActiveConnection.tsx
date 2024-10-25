import { Box, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { useStores } from '../store/store-container';
import Settings from '../pages/settings';
const ActiveConnection = () => {
  const { global } = useStores();
  const [loading, setLoading] = useState(false);
  const [connectionDisplay, setConnectionDisplay] = useState('🔌 No connection!');

  // Load Active Connection and Metadata
  useEffect(() => {
    setLoading(true);
    global
      .loadConnectionMetadata()
      .then(() => {
        global.connected = true;
        setLoading(false);
      })
      .catch(err => {
        global.connected = false;
        setLoading(false);
        console.error(err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!global.connected) {
      setConnectionDisplay('🔌 No connection!');
    } else {
      const serverVersion = global.version ?? 'obsolete';
      const dbConnectionName = global.getConnectionName();
      const status = dbConnectionName ? '⚡' : '🔌';
      setConnectionDisplay(
        `${status} [${serverVersion}] ${dbConnectionName || 'Click here to configure db connection'}`,
      );
    }
  }, [global, global.connected, global.connection, global.version]);

  return (
    <Box>
      {global.showSettings && <Settings />}
      <Typography
        variant="caption"
        component="code"
        color="gray"
        onClick={() => global.setShowSettings(!global.showSettings)}
        style={{ cursor: 'pointer' }}
      >
        {loading ? 'Connecting...' : connectionDisplay}
      </Typography>
    </Box>
  );
};

export default observer(ActiveConnection);
