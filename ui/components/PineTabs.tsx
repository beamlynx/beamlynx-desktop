import * as React from 'react';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import TabContext from '@mui/lab/TabContext';
import TabList from '@mui/lab/TabList';
import TabPanel from '@mui/lab/TabPanel';
import Session from './Session';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import { AddCircle, AddCircleOutlineRounded } from '@mui/icons-material';

const PineTabs = observer(() => {
  const { global } = useStores();
  const [value, setValue] = React.useState('1');

  const handleChange = (event: React.SyntheticEvent, newValue: string) => {
    setValue(newValue);
  };
  return (
    <Box sx={{ width: '100%' }}>
      <TabContext value={value}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <TabList onChange={handleChange}>
            <Tab label={global.getSessionName()} value="1" />
            <AddCircle
              color="primary"
              sx={{ ml: 2, mt: 2, cursor: 'pointer' }}
              onClick={() => {
                global.message = '🛠️ Multiple sessions coming soon... 📅';
              }}
            ></AddCircle>
          </TabList>
        </Box>
        <TabPanel sx={{ padding: 0 }} value="1">
          <Session></Session>
        </TabPanel>
      </TabContext>
    </Box>
  );
});

export default PineTabs;
