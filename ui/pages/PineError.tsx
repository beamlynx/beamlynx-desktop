import React, { ReactElement } from "react";

import { observer } from "mobx-react-lite";
import { useStores } from "./store/container";
import { Typography } from "@mui/material";

const PineError = observer(() => {
    const { store } = useStores();
    return (
        <Typography variant="caption" component="code" color="red">{store.error}</Typography>
    );
  });

export default PineError;