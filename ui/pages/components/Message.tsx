import { Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "../store/store-container";

const SuccessMessages = [
  '💣 Boom!',
  '💥 Babbamm!',
  '🙌 Yes!', 
  '🤝 Nice work!', 
  '🧐 Impressive!', 
  '💣 💥  Baboom!', 
  `🛼 That's how we roll!`, 
  '🥁 Drum roll!', 
  '🦸 Super!', 
  '😎  Sublime!', 
  '😌 Noice!', 
  '😌 Nice!', 
  '💥 Hulk Smash!',
  `🧻🧻 You're on a roll!`,
  `💆 Well didn't that feel nice...`,
  '🤤 Nerdgasm!',
];

const pickSuccessMessage = () => {
  return SuccessMessages[Math.floor(Math.random()*SuccessMessages.length)];
}


const Message = observer(() => {
    const { global: store } = useStores();
    
    if (!store.expression) {
      return <Typography/>
    }
    if (store.error) {
      return <Typography variant="caption"color="red">{"🤦 " + store.error}</Typography>;
    }
    if (store.loaded) {
      return <Typography variant="caption" color="gray">{pickSuccessMessage()}</Typography>;
    } else {
      return <Typography variant="caption" color="gray">{store.hints}</Typography>;
    }

  });

export default Message;