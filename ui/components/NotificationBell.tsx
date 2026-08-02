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
      <IconButton onClick={onClick} color="inherit" tabIndex={1}>
        <Notifications
          sx={{
            color: hasUnreadUpdates ? 'var(--primary-color)' : 'inherit',
          }}
        />
      </IconButton>
    </Box>
  );
};

export default NotificationBell;

