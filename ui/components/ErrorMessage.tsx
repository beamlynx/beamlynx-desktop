import { Typography, useMediaQuery, useTheme, Tooltip, Box } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import React, { useEffect } from 'react';

interface MessageProps {}

const Message: React.FC<MessageProps> = observer(({}) => {
  const { global } = useStores();
  const [session, setSession] = React.useState(global.getSession(global.activeSessionId));
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('lg'));

  useEffect(() => {
    const sessionId = global.activeSessionId;
    const session = global.getSession(sessionId);
    setSession(session);
  }, [global, global.activeSessionId]);

  if (!session.error) {
    return null;
  }
  if (session.errorType === 'parse') {
    return (
      <Box sx={{ margin: 1 }}>
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'monospace',
            whiteSpace: 'break-spaces',
            lineHeight: 1,
            color: 'red',
          }}
        >
          {session.error}
        </Typography>
      </Box>
    );
  }
  const truncatedError = session.error.substring(0, isSmallScreen ? 40 : 120);
  return (
    <Box sx={{ margin: 1 }}>
      <Tooltip title={session.error} placement="bottom-start">
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'Courier, Courier New, monospace',
            whiteSpace: 'break-spaces',
            lineHeight: 1,
            color: 'error.main',
          }}
        >
          {'🚨 ' + truncatedError}
        </Typography>
      </Tooltip>
    </Box>
  );
});

export default Message;
