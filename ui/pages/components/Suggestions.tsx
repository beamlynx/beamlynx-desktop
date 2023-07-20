import { Typography } from "@mui/material";
import { toJS } from "mobx";
import { observer } from "mobx-react-lite";
import React from "react";
import { useStores } from "../store/container";


const Message = observer(() => {
    const { store } = useStores();
    if (!store.hints) {
        return <Typography variant="caption" color="white">-</Typography>;
    }

    return <Typography variant="caption" color="gray">{store.hints}</Typography>;
  });

export default Message;