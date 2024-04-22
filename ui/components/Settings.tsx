
import { observer } from "mobx-react-lite";
import React from "react";
import { Button } from "@mui/material";
import { useStores } from "../store/store-container";

const Settings = observer(() => {
    const { graph: settings } = useStores();
    return (
        <>
        <Button onClick={() => {settings.loadDummyNodesAndEdges() }}>⚙</Button>
        </>
    );
  });

export default Settings;