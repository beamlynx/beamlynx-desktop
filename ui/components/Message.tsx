import { Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';

// const errorStyle = {
//   fontFamily: 'Courier, Courier New, monospace', // Use a monospaced font
//   whiteSpace: 'pre-line', // Respect whitespace and new lines
//   lineHeight: 1.2, // Adjust the line height to reduce space between lines
//   color: 'red', // Color the text red
// };

interface MessageProps {
  sessionId: string;
}

const Message: React.FC<MessageProps> = observer(({ sessionId }) => {
  const { global: store } = useStores();
  const session = store.getSession(sessionId);

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
      {session.message}
    </Typography>
  );
});

export default Message;
