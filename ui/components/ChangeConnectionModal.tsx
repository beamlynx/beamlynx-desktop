import { Box, ButtonBase, Typography } from '@mui/material';
import { AddBoxOutlined, SwapHoriz } from '@mui/icons-material';
import ModalSurface from './ModalSurface';
import { observer } from 'mobx-react-lite';
import React, { ReactNode, useState } from 'react';
import { useRetainedValue } from '../hooks/useRetainedValue';
import { useStores } from '../store/store-container';

/**
 * Asks what to do when a connection is picked while the active tab has a
 * query: open the connection in a new tab (the default), or switch this tab
 * to it, where the query may not work -- table and column names it relies on
 * may not exist there. Cancel, Escape or a click outside does neither. See
 * GlobalStore.pendingConnectionSwitch.
 *
 * The two ways to go on are rows that each say what they do, rather than
 * three buttons in a line: the choice is between two outcomes, and a row
 * has room to name the consequence that sets them apart.
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
    <ModalSurface
      open={Boolean(pending)}
      onClose={handleCancel}
      surfaceSx={{ width: 440, maxWidth: 'calc(100vw - 32px)', p: 2.5 }}
      aria-labelledby="change-connection-title"
    >
      <Typography
        id="change-connection-title"
        component="h2"
        sx={{ color: 'var(--text-color)', fontSize: 17, fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}
      >
        Open {targetLabel}
      </Typography>
      <Typography sx={{ color: 'var(--canvas-text-dim)', fontSize: 13, mt: 0.5, mb: 2 }}>
        This tab already has a query.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Choice
          primary
          autoFocus
          disabled={busy}
          icon={<AddBoxOutlined />}
          title="Open in a new tab"
          detail="This tab and its query stay as they are."
          onClick={() => run(global.openPendingConnectionInNewTab)}
        />
        <Choice
          disabled={busy}
          icon={<SwapHoriz />}
          title="Switch this tab"
          detail="The query may not work there: some tables or columns it uses might not exist."
          onClick={() => run(global.confirmPendingConnectionSwitch)}
        />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
        <ButtonBase
          onClick={handleCancel}
          disabled={busy}
          disableRipple
          sx={{
            fontSize: 13,
            color: 'var(--canvas-text-dim)',
            px: 1,
            py: 0.5,
            borderRadius: 1,
            '&:hover, &.Mui-focusVisible': { color: 'var(--text-color)', backgroundColor: 'var(--hover-color)' },
          }}
        >
          Cancel
        </ButtonBase>
      </Box>
    </ModalSurface>
  );
});

const Choice = ({
  icon,
  title,
  detail,
  primary = false,
  autoFocus = false,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  primary?: boolean;
  autoFocus?: boolean;
  disabled: boolean;
  onClick: () => void;
}) => (
  <ButtonBase
    onClick={onClick}
    disabled={disabled}
    autoFocus={autoFocus}
    disableRipple
    sx={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      gap: 1.5,
      textAlign: 'left',
      px: 1.5,
      py: 1.25,
      borderRadius: 1,
      border: '1px solid',
      // The default is marked by its border alone: one accent, no fill, so
      // both rows still read as equal-weight choices.
      borderColor: primary ? 'var(--primary-color)' : 'var(--border-color)',
      color: 'var(--text-color)',
      transition: 'background-color var(--motion-fast) var(--motion-ease-enter)',
      '&:hover': { backgroundColor: 'var(--hover-color)' },
      '&.Mui-focusVisible': {
        backgroundColor: 'var(--hover-color)',
        outline: '2px solid var(--primary-color)',
        outlineOffset: 2,
      },
      '&.Mui-disabled': { opacity: 0.6 },
      '& .MuiSvgIcon-root': {
        fontSize: 20,
        mt: '1px',
        color: primary ? 'var(--primary-color)' : 'var(--canvas-text-dim)',
      },
    }}
  >
    {icon}
    <Box sx={{ minWidth: 0 }}>
      <Typography component="span" sx={{ display: 'block', fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
        {title}
      </Typography>
      <Typography
        component="span"
        sx={{ display: 'block', fontSize: 13, color: 'var(--canvas-text-dim)', lineHeight: 1.45, mt: 0.25 }}
      >
        {detail}
      </Typography>
    </Box>
  </ButtonBase>
);

export default ChangeConnectionModal;
