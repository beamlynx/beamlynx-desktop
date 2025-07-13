import { Box, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { useStores } from '../store/store-container';
import Settings from '../pages/settings';
const ActiveConnection = () => {
  const { global } = useStores();
  const [connectionDisplay, setConnectionDisplay] = useState('🔌 No connection!');

  useEffect(() => {
    if (!global.pineConnected) {
      setConnectionDisplay('🔌 No connection to Pine server!');
      return;
    }

    const serverVersion = global.version ?? 'obsolete';
    const dbConnectionName = global.getConnectionName();
    const status = global.dbConnected ? '⚡' : '🔌';

    setConnectionDisplay(
      `${status} [${serverVersion}] ${dbConnectionName || 'Not connected to database'}`,
    );

    // Show the database connection settings if no database is connected
    if (!global.dbConnected) {
      global.setShowSettings(true);
    }
  }, [global, global.pineConnected, global.dbConnected, global.version, global.connection]);

  return (
    <Box>
      {global.showSettings && <Settings />}
      <Typography
        variant="caption"
        component="code"
        color="gray"
        {...(global.pineConnected && {
          onClick: () => global.setShowSettings(!global.showSettings),
          style: { cursor: 'pointer' },
        })}
      >
        {connectionDisplay}
      </Typography>
    </Box>
  );
};

export default observer(ActiveConnection);
