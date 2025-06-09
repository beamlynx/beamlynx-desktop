import { Typography, useMediaQuery, useTheme } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import React, { useEffect } from 'react';
import { devOnly } from '../store/util';

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

  if (session.error && session.errorType !== 'parse') {
    return (
      <Typography
        variant="caption"
        sx={{
          fontFamily: 'Courier, Courier New, monospace',
          whiteSpace: 'break-spaces',
          lineHeight: 1,
          color: 'red',
        }}
      >
        {'🤦 ' + session.error}
      </Typography>
    );
  }
  return (
    <Typography variant="caption" color="gray">
      {devOnly(`mode: ${session.mode} | `)}
      {devOnly(`loading: ${session.loading} | `)}
      {session.message.substring(0, isSmallScreen ? 40 : 120)}
    </Typography>
  );
});

export default Message;
