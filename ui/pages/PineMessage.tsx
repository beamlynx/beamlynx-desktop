import React, { ReactElement } from "react";

import { observer } from "mobx-react-lite";
import { useStores } from "./store/container";
import { Typography } from "@mui/material";
import { Box } from '@mui/material';

const SuccessMessages = [
  'Boom!',
  'Yes!', 
  'Nice work!', 
  'Impressive', 
  'Baboom!', 
  `That's how we roll!`, 
  'Drum roll!', 
  'Super!', 
  'Sublime', 
  'Noice', 
  'Nice',
  'Hulk Smash!',
  `You're on a roll!`,
  `Well didn't that feel nice..`,
]

const PineMessage = observer(() => {
    const { store } = useStores();
    return (
      <>
      {store.expression && store.error ?
        (<Typography variant="caption"color="red">{store.error}</Typography>) :
        (!store.expression ?
          (<Typography variant="caption" color="gray">Type a pine expression</Typography>) :
          (store.loaded ? 
            (<Typography variant="caption" color="gray">{SuccessMessages[Math.floor(Math.random()*SuccessMessages.length)]}</Typography>) :
            (<Typography variant="caption" color="gray">Press Enter to see results</Typography>)
            )
          )}
      </>
    );
  });

export default PineMessage;