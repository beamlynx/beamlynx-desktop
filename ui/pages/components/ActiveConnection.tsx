import { Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';
import { useStores } from '../../store/store-container';
const ActiveConnection = observer(({}) => {
  const { global: store } = useStores();

  // Load Active Connection and Metadata
  useEffect(() => {
    store.loadConnectionMetadata().catch(err => {
      console.error(err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Typography variant="caption" component="code" color="gray">
      {store.connectionName ? `⚡ ${store.connectionName}` : '🔌 Not connected!'}
    </Typography>
  );
});

export default ActiveConnection;
