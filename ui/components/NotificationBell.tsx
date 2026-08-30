import { IconButton, Box } from '@mui/material';
import { Notifications } from '@mui/icons-material';
import React from 'react';

interface NotificationBellProps {
  hasUnreadUpdates: boolean;
  onClick: () => void;
}

const NotificationBell: React.FC<NotificationBellProps> = ({
  hasUnreadUpdates,
  onClick,
}) => {
  return (
    <Box
      sx={{
        ml: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* No explicit tabIndex -- see SettingsButton.tsx's identical comment
          for why a positive value here (this used to be 1) was hijacking
          Tab order document-wide. */}
      <IconButton onClick={onClick} color="inherit">
        <Notifications
          sx={{
            color: hasUnreadUpdates ? 'var(--notification-color)' : 'inherit',
          }}
        />
      </IconButton>
    </Box>
  );
};

export default NotificationBell;

