import { Box, Button, Typography } from '@mui/material';
import { ReactNode, useState } from 'react';
import ModalSurface from './ModalSurface';

/**
 * The one way the app asks before something that weakens protection or
 * deletes something: allowing agents to read every column, starting a
 * policy from a template, deleting a connection. The title says what will
 * happen, the confirm button names the action, and Cancel has focus, so
 * Enter alone never confirms a dangerous choice. Reversible changes don't
 * ask; decisions an agent waits on stay cards in its timeline.
 */
const ConfirmDialog = ({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  confirmDisabled = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => Promise<unknown> | void;
  onClose: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
    onClose();
  };
  return (
    <ModalSurface open={open} onClose={busy ? () => {} : onClose} surfaceSx={{ width: 460, p: 3 }}>
      <Typography variant="h6" component="h2" sx={{ color: 'var(--text-color)', fontWeight: 500, mb: 1.5 }}>
        {title}
      </Typography>
      <Box sx={{ color: 'var(--text-color)', mb: 3, '& p': { m: 0, mb: 1 }, fontSize: 14 }}>{children}</Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button
          autoFocus
          onClick={onClose}
          disabled={busy}
          sx={{ color: 'var(--text-color)', '&:hover': { backgroundColor: 'var(--hover-color)' } }}
        >
          Cancel
        </Button>
        <Button
          onClick={confirm}
          variant="contained"
          color={danger ? 'error' : 'primary'}
          disabled={busy || confirmDisabled}
          sx={danger ? undefined : { bgcolor: 'var(--primary-color)', color: '#fff', '&:hover': { bgcolor: 'var(--primary-color)', opacity: 0.9 } }}
        >
          {confirmLabel}
        </Button>
      </Box>
    </ModalSurface>
  );
};

export default ConfirmDialog;
