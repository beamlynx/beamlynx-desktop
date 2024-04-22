import { UserButton, useUser } from "@clerk/nextjs";
import { Box, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useStores } from "../store/store-container";

const UserBox = observer(() => {
const { user } = useUser();
const { global: store } = useStores();

if (user) {
    const email = user?.emailAddresses?.[0]?.emailAddress || '';
    store.setEmail(email);
}

return (
    <Box sx={{ m: 1, ml: 2 }}>
        {/* <Typography variant="caption" color="gray">
            {store.email ? store.email : '-'}
        </Typography> */}
        <UserButton userProfileMode='modal'/>
    </Box>
);
  });

export default UserBox;