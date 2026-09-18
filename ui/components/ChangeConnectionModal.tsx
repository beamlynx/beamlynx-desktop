import { Box, Modal, Typography, Button } from '@mui/material';
import { observer } from 'mobx-react-lite';
import React, { useState } from 'react';
import { useStores } from '../store/store-container';

/**
 * Warns before switching the active tab's connection when that tab has a
 * non-empty Pine expression -- the expression stays as-is but now resolves
 * against a different connection's schema, so table/column names it relies
 * on may no longer exist. See GlobalStore.pendingConnectionSwitch.
 */
const ChangeConnectionModal = observer(() => {
  const { global } = useStores();
  const [switching, setSwitching] = useState(false);
  const pending = global.pendingConnectionSwitch;

  const targetId = pending && (pending.kind === 'select' ? pending.connectionId : pending.id);
  const targetLabel = targetId
    ? global.connections.find(c => c.id === targetId)?.label ?? targetId
    : '';

  const handleCancel = () => global.cancelPendingConnectionSwitch();

  const handleConfirm = async () => {
    setSwitching(true);
    try {
      await global.confirmPendingConnectionSwitch();
    } finally {
      setSwitching(false);
    }
  };

  return (
    <Modal open={Boolean(pending)} onClose={handleCancel}>
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 450,
          bgcolor: 'var(--background-color)',
          border: '1px solid var(--border-color)',
          boxShadow: 24,
          p: 3,
          borderRadius: 2,
          outline: 'none',
        }}
      >
        <Typography
          variant="h6"
          component="h2"
          sx={{
            color: 'var(--text-color)',
            fontWeight: 500,
            mb: 2,
          }}
        >
          Switch connection?
        </Typography>

        <Typography variant="body2" sx={{ color: 'var(--text-color)', mb: 3 }}>
          This tab&apos;s query may not work on <strong>{targetLabel}</strong> -- some tables or
          columns it uses might not exist there.
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button
            onClick={handleCancel}
            disabled={switching}
            sx={{
              color: 'var(--text-color)',
              '&:hover': {
                backgroundColor: 'var(--hover-color)',
              },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            variant="contained"
            disabled={switching}
            sx={{
              bgcolor: 'var(--primary-color)',
              color: '#fff',
              '&:hover': {
                bgcolor: 'var(--primary-color)',
                opacity: 0.9,
              },
            }}
          >
            Switch connection
          </Button>
        </Box>
      </Box>
    </Modal>
  );
});

export default ChangeConnectionModal;
