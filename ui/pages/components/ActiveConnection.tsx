import { Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { useStores } from '../../store/store-container';
const ActiveConnection = observer(({}) => {
  const { global: store } = useStores();
  const [loading, setLoading] = useState(false);

  // Load Active Connection and Metadata
  useEffect(() => {
    setLoading(true);
    store.loadConnectionMetadata().then(() => {
      store.connected = true;
      setLoading(false);
    }).catch(err => {
      store.connected = false;
      setLoading(false);
      console.error(err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Typography variant="caption" component="code" color="gray">
      {loading ? 'Connecting...' : store.connection ? `⚡ ${store.connection}` : `🔌 No connection! `}
    </Typography>
  );
});

export default ActiveConnection;
