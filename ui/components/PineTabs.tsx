import * as React from 'react';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import TabContext from '@mui/lab/TabContext';
import TabList from '@mui/lab/TabList';
import TabPanel from '@mui/lab/TabPanel';
import Session from './Session';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import { AddCircle, CloseOutlined } from '@mui/icons-material';
import { IconButton } from '@mui/material';

const PineTabs = observer(() => {
  const { global } = useStores();
  const [tabs, setTabs] = React.useState([{ sessionId: 'session-0' }]); // Initial tabs
  const [sessionId, setSessionId] = React.useState('session-0'); // Active session

  const setActiveTab = (newSessionId: string) => {
    global.activeSessionId = newSessionId;
    setSessionId(newSessionId);
  };

  const handleChange = (event: React.SyntheticEvent, newSessionId: string) => {
    setActiveTab(newSessionId);
  };

  const addTab = () => {
    const id = Math.random().toString(36).substring(7);
    const session = global.createSession(id);
    setTabs([...tabs, { sessionId: session.id }]);
    setActiveTab(session.id);
  };

  const removeTab = (sessionIdToRemove: string) => {
    // Reset the session if it is the last tab
    if (tabs.length === 1) {
      global.createSession(sessionIdToRemove);
      return;
    }

    // Remove the tab from the list
    const updatedTabs = tabs.filter(tab => tab.sessionId !== sessionIdToRemove);
    setTabs(updatedTabs);

    // If the active tab is removed, switch to another tab (the first one, or if no tabs remain, handle gracefully)
    if (sessionId === sessionIdToRemove && updatedTabs.length > 0) {
      setActiveTab(updatedTabs[0].sessionId);
    }

    // Remove the session from global store
    global.deleteSession(sessionIdToRemove);
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
                tabIndex={-1} // Prevent tab focus
                label={
                  <span>
                    {global.getSessionName(tab.sessionId)}
                    <IconButton
                      style={{ marginLeft: '5px' }}
                      size="small"
                      component="span"
                      tabIndex={-1} // Prevent tab focus
                      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation();
                        removeTab(tab.sessionId);
                      }}
                    >
                      <CloseOutlined sx={{ fontSize: '14px' }} tabIndex={-1} />
                    </IconButton>
                  </span>
                }
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
