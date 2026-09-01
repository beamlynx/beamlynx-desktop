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
      {/* No explicit tabIndex -- a positive value here (this used to be 1)
          jumps ahead of every zero/natural-order element in the WHOLE
          document's Tab sequence, not just this header: confirmed live that
          it, together with NotificationBell's identical tabIndex={1}, was
          why Tab from inside the docked Settings panel (or anywhere else)
          kept escaping to these two icons and looping between them, instead
          of staying within whatever actually had focus. MUI's IconButton is
          already a real <button> -- it needs no explicit tabIndex to be
          reachable in its own natural DOM-order turn. */}
      <IconButton onClick={onClick} color="inherit" aria-label="Settings">
        <Settings />
      </IconButton>
    </Box>
  );
};

export default SettingsButton;
