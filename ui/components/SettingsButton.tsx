import { IconButton, Box } from '@mui/material';
import { Settings } from '@mui/icons-material';
import React from 'react';

interface SettingsButtonProps {
  onClick: () => void;
}

const SettingsButton: React.FC<SettingsButtonProps> = ({ onClick }) => {
  return (
    <Box
      sx={{
        ml: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <IconButton onClick={onClick} color="inherit" tabIndex={1} aria-label="Settings">
        <Settings />
      </IconButton>
    </Box>
  );
};

export default SettingsButton;
