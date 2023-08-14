import { observer } from 'mobx-react-lite';
import { useStores } from '../../store/store-container';

const Query = observer(() => {
  const { global: store } = useStores();

  return (
    <pre>
      <code style={{ color: 'gray', fontFamily: 'monospace', fontSize: '12px' }}>
        {store.loaded ? '' : store.query}
      </code>
    </pre>
  );
});

export default Query;
