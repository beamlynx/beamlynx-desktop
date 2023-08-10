import React from "react"
import { Box, Typography } from "@mui/material";
import {observer } from "mobx-react-lite"
import { useStores } from "../store/container";

const ActiveConnection = observer(({}) =>
        {
            const { store } = useStores();
            return (
                <Typography variant="caption" component="code" color="gray">{"⚡ " + (store.connectionName || "not connected")}</Typography>
            )
        });

export default ActiveConnection;
