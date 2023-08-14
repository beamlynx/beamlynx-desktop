
import { observer } from "mobx-react-lite";
import React from "react";
import { useStores } from "../store/store-container";
import { Button } from "@mui/material";

const Settings = observer(() => {
    const { graph: settings } = useStores();
    return (
        <>
        <Button onClick={() => {settings.loadDummyNodesAndEdges() }}>⚙</Button>
        </>
    );
  });

export default Settings;