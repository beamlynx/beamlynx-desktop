import React, { ReactElement } from "react";

import TextField from '@mui/material/TextField';
import { Box } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "./store/container";

const PineQuery = observer(() => {
    const { store } = useStores();
    return (
      <pre>{store.query}</pre>
    );
  });

export default PineQuery;