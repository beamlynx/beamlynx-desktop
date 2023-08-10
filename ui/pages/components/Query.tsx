import { observer } from "mobx-react-lite";
import React from "react";
import { useStores } from "../store/container";

const Query = observer(() => {
    const { store } = useStores();
    return (
      <pre>{store.loaded ? '' : store.query}</pre>
    );
  });

export default Query;