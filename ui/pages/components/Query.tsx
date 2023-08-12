import { observer } from "mobx-react-lite";
import React from "react";
import { useStores } from "../store/container";

const Query = observer(() => {
    const { store } = useStores();
    return (
      <pre>
        <code style={{ color: 'gray', fontFamily: 'monospace', fontSize: '12px'}}>
          {store.loaded ? '' : store.query}
        </code>
      </pre>
    );
  });

export default Query;