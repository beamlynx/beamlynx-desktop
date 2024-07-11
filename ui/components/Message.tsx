import { Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';


const Message = observer(() => {
  const { global: store } = useStores();

  if (!store.expression) {
    return <Typography />;
  }
  if (store.error) {
    return (
      <Typography variant="caption" color="red">
        {'🤦 ' + store.error}
      </Typography>
    );
  }
  if (store.loaded) {
    return (
      <Typography variant="caption" color="gray">
        {store.message}
      </Typography>
    );
  } else {
    return (
      <Typography variant="caption" color="gray">
        {store.hintsMessage}
      </Typography>
    );
  }
});

export default Message;
