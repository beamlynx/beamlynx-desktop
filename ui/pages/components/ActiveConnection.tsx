import React from "react"
import { Box, Typography } from "@mui/material";
import {observer } from "mobx-react-lite"
import { useStores } from "../store/store-container";

const ActiveConnection = observer(({}) =>
        {
            const { global: store } = useStores();
            return (
                <Typography variant="caption" component="code" color="gray">{store.connectionName  ? `⚡ ${store.connectionName}` : "🔌 Not connected!"}</Typography>
            )
        });

export default ActiveConnection;
