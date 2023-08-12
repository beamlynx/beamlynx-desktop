
import { observer } from "mobx-react-lite";
import React from "react";
import { useStores } from "../store/container";
import { Button } from "@mui/material";

//⚙

const Settings = observer(() => {
    const { settings } = useStores();
    return (
        <>
        <Button onClick={() => {settings.getDummyMetadata() }}>1</Button>
        <Button onClick={() => {settings.getDummyMetadata2() }}>2</Button>
        </>
    );
  });

export default Settings;