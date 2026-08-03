import CheckIcon from '@mui/icons-material/Check';
import { Box, Divider, IconButton, List, ListItemButton, ListItemText, Modal, Typography } from '@mui/material';
import { Close } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useStores } from '../store/store-container';
import { isDesktop } from '../store/util';
import { DecryptionFailedError } from '../store/global.store';

/**
 * Lists saved/known db connections and lets you switch to one -- the same
 * data and switch logic as ActiveConnection's dropdown, but reachable from
 * the command palette (which has no clicked DOM element to anchor a MUI
 * Menu to, hence a Modal here instead).
 */
const ConnectionsListModal = observer(() => {
  const { global } = useStores();
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const activeSession = global.sessions[global.activeSessionId];

  const handleClose = () => global.setShowConnectionsModal(false);

  const handleSelect = async (id: string) => {
    const isActive = isDesktop() ? id === global.activeProfileId : id === activeSession?.connectionId;
    if (isActive) {
      handleClose();
      return;
    }
    setSwitchingId(id);
    try {
      if (isDesktop()) {
        await global.connectToSavedProfile(id);
      } else {
        await global.selectConnection(id);
      }
      handleClose();
    } catch (e) {
      // Same recovery path as ActiveConnection's dropdown: a decryption
      // failure re-opens Settings to let the user re-enter the password.
      // Any other failure (e.g. the DB is unreachable) is already surfaced
      // via global.connectionError (see ConnectionErrorSnackbar) -- leave
      // the modal open so the user can pick a different connection.
      if (e instanceof DecryptionFailedError) {
        global.setShowSettings(true);
        handleClose();
      }
    } finally {
      setSwitchingId(null);
    }
  };

  const handleAddNew = () => {
    global.setShowSettings(true);
    handleClose();
  };

  return (
    <Modal open={global.showConnectionsModal} onClose={handleClose}>
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 400,
          maxHeight: '70vh',
          overflowY: 'auto',
          bgcolor: 'var(--background-color)',
          border: '1px solid var(--border-color)',
          boxShadow: 24,
          p: 3,
          borderRadius: 2,
          outline: 'none',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 1,
          }}
        >
          <Typography variant="h6" component="h2" sx={{ color: 'var(--text-color)', fontWeight: 500 }}>
            Database Connections
          </Typography>
          <IconButton
            onClick={handleClose}
            size="small"
            sx={{ color: 'var(--text-color)', '&:hover': { backgroundColor: 'var(--hover-color)' } }}
          >
            <Close fontSize="small" />
          </IconButton>
        </Box>

        <List sx={{ py: 0 }}>
          {global.connections.length === 0 && (
            <Typography variant="body2" sx={{ color: 'var(--text-color)', opacity: 0.7, py: 1 }}>
              No connections yet.
            </Typography>
          )}
          {global.connections.map(({ id, label }) => {
            const isActive = isDesktop() ? id === global.activeProfileId : id === activeSession?.connectionId;
            return (
              <ListItemButton
                key={id}
                disabled={switchingId !== null}
                onClick={() => handleSelect(id)}
                sx={{ borderRadius: 1, gap: 1 }}
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
                <ListItemText
                  primary={label}
                  primaryTypographyProps={{ sx: { color: 'var(--text-color)', fontSize: '0.85rem' } }}
                />
                {isActive && <CheckIcon sx={{ fontSize: 16, opacity: 0.7, color: 'var(--text-color)' }} />}
              </ListItemButton>
            );
          })}
        </List>

        <Divider sx={{ my: 1, borderColor: 'var(--border-color)' }} />

        <ListItemButton onClick={handleAddNew} sx={{ borderRadius: 1 }}>
          <ListItemText
            primary="Add new connection…"
            primaryTypographyProps={{ sx: { color: 'var(--text-color)', fontSize: '0.85rem' } }}
          />
        </ListItemButton>
      </Box>
    </Modal>
  );
});

export default ConnectionsListModal;
