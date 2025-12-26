import { IconButton } from '@mui/material';
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
    <IconButton
      onClick={onClick}
      sx={{
        ml: 1,
        animation: hasUnreadUpdates ? 'bellShake 1.5s ease-in-out infinite' : 'none',
        transformOrigin: 'top center',
        '@keyframes bellShake': {
          '0%, 50%, 100%': {
            transform: 'rotate(0deg)',
          },
          '55%': {
            transform: 'rotate(-25deg)',
          },
          '60%': {
            transform: 'rotate(25deg)',
          },
          '65%': {
            transform: 'rotate(-25deg)',
          },
          '70%': {
            transform: 'rotate(25deg)',
          },
          '75%': {
            transform: 'rotate(-20deg)',
          },
          '80%': {
            transform: 'rotate(20deg)',
          },
          '85%': {
            transform: 'rotate(-10deg)',
          },
          '90%': {
            transform: 'rotate(10deg)',
          },
          '95%': {
            transform: 'rotate(0deg)',
          },
        },
      }}
      color="inherit"
      tabIndex={1}
    >
      <Notifications
        sx={{
          color: hasUnreadUpdates ? 'error.main' : 'inherit',
        }}
      />
    </IconButton>
  );
};

export default NotificationBell;

