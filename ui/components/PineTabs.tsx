import * as React from 'react';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import TabContext from '@mui/lab/TabContext';
import TabList from '@mui/lab/TabList';
import TabPanel from '@mui/lab/TabPanel';
import Session from './Session';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import { AddCircle } from '@mui/icons-material';

const PineTabs = observer(() => {
  const { global } = useStores();
  const [tabs, setTabs] = React.useState([{ sessionId: '0' }]); // Initial tabs
  const [sessionId, setSessionId] = React.useState('0'); // Active tab

  const handleChange = (event: React.SyntheticEvent, newSessionId: string) => {
    setSessionId(newSessionId);
  };

  const addTab = () => {
    const newSessionId = `${tabs.length}`; // Generate new sessionId as string
    setTabs([...tabs, { sessionId: newSessionId }]); // Add new tab
    global.createSession(newSessionId); // Create a new session

    setSessionId(newSessionId); // Set the new tab as active
  };

  return (
    <Box sx={{ width: '100%' }}>
      <TabContext value={sessionId}>
        <Box
          sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center' }}
        >
          <TabList onChange={handleChange}>
            {tabs.map((tab, index) => (
              <Tab
                key={tab.sessionId}
                label={global.getSessionName(tab.sessionId)}
                value={tab.sessionId}
              />
            ))}
          </TabList>

          {/* Button to add new tab */}
          <AddCircle color="primary" sx={{ ml: 2, cursor: 'pointer' }} onClick={addTab} />
        </Box>

        {tabs.map(tab => (
          <TabPanel key={tab.sessionId} sx={{ padding: 0 }} value={tab.sessionId}>
            <Session sessionId={tab.sessionId}></Session>
          </TabPanel>
        ))}
      </TabContext>
    </Box>
  );
});

export default PineTabs;
