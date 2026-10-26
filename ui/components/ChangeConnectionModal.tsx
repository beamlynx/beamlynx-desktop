import { Box, Typography, Button } from '@mui/material';
import ModalSurface from './ModalSurface';
import { observer } from 'mobx-react-lite';
import React, { useState } from 'react';
import { useRetainedValue } from '../hooks/useRetainedValue';
import { useStores } from '../store/store-container';

/**
 * Asks what to do when a connection is picked while the active tab has a
 * query: open the connection in a new tab (the default), or switch this tab
 * to it, where the query may not work -- table and column names it relies on
 * may not exist there. Cancel, Escape or a click outside does neither. See
 * GlobalStore.pendingConnectionSwitch.
 */
const ChangeConnectionModal = observer(() => {
  const { global } = useStores();
  const [busy, setBusy] = useState(false);
  const pending = global.pendingConnectionSwitch;

  const targetId = pending && (pending.kind === 'select' ? pending.connectionId : pending.id);
  // Retained, because this dialog now animates out: `pending` is already
  // null for the length of the closing transition, and without this the
  // sentence below would spend its whole fade-out naming no connection at
  // all. See hooks/useRetainedValue.ts.
  const targetLabel = useRetainedValue(
    targetId ? global.connections.find(c => c.id === targetId)?.label ?? targetId : null,
  );

  const handleCancel = () => {
    if (!busy) global.cancelPendingConnectionSwitch();
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      console.error('[connections] opening the connection failed ->', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalSurface open={Boolean(pending)} onClose={handleCancel} surfaceSx={{ width: 450, p: 3 }}>
      <Typography
        variant="h6"
        component="h2"
        sx={{
          color: 'var(--text-color)',
          fontWeight: 500,
          mb: 2,
        }}
      >
        Open {targetLabel}
      </Typography>

      <Typography variant="body2" sx={{ color: 'var(--text-color)', mb: 3 }}>
        This tab has a query. Open <strong>{targetLabel}</strong> in a new tab, or switch this
        tab to it. The query may not work there: some tables or columns it uses might not exist.
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          onClick={handleCancel}
          disabled={busy}
          sx={{
            color: 'var(--text-color)',
            '&:hover': {
              backgroundColor: 'var(--hover-color)',
            },
          }}
        >
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          onClick={() => run(global.confirmPendingConnectionSwitch)}
          variant="outlined"
          disabled={busy}
          sx={{ color: 'var(--text-color)', borderColor: 'var(--border-color)' }}
        >
          Switch this tab
        </Button>
        <Button
          onClick={() => run(global.openPendingConnectionInNewTab)}
          variant="contained"
          disabled={busy}
          autoFocus
          sx={{
            bgcolor: 'var(--primary-color)',
            color: '#fff',
            '&:hover': {
              bgcolor: 'var(--primary-color)',
              opacity: 0.9,
            },
          }}
        >
          Open in new tab
        </Button>
      </Box>
    </ModalSurface>
  );
});

export default ChangeConnectionModal;
