import React from "react"
import { Box } from "@mui/material";
import {observer } from "mobx-react-lite"
import { useStores } from "./store/container";

const ActiveConnection = observer(({}) =>
        {
            const { store } = useStores();
            return (
                <Box>{store.connection && ">> " + store.connection}</Box>
            )
        });

export default ActiveConnection;
