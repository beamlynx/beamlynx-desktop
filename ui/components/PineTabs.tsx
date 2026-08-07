import * as React from 'react';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import TabContext from '@mui/lab/TabContext';
import TabList from '@mui/lab/TabList';
import TabPanel from '@mui/lab/TabPanel';
import Session from './Session';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import { useStores } from '../store/store-container';
import { AddCircle, CloseOutlined } from '@mui/icons-material';
import { IconButton, CircularProgress } from '@mui/material';

const PineTabs = observer(() => {
  const { global } = useStores();

  // Derive tabs directly from global sessions
  const tabs = Object.keys(global.sessions).map(sessionId => ({ sessionId }));
  const sessionId = global.activeSessionId;
  const activeSession = global.sessions[sessionId];
  const activeConnectionId = activeSession?.connectionId || '';
  const activeIndicatorColor =
    global.getConnectionColor(activeConnectionId) || 'var(--border-color)';

  const setActiveTab = (newSessionId: string) => {
    runInAction(() => {
      global.activeSessionId = newSessionId;
    });
  };

  const handleChange = (event: React.SyntheticEvent, newSessionId: string) => {
    setActiveTab(newSessionId);
  };

  const addTab = () => {
    global.addTab();
  };

  const removeTab = (sessionIdToRemove: string) => {
    global.closeTab(sessionIdToRemove);
  };

  return (
    <Box sx={{ width: '100%', mt: 0, pt: 0 }}>
      <TabContext value={sessionId}>
        <Box
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            mt: 0,
          }}
        >
          <TabList
            onChange={handleChange}
            sx={{
              '& .MuiTab-root': {
                color: 'var(--text-color)',
                '&.Mui-selected': {
                  color: 'var(--primary-color)',
                },
              },
              '& .MuiTabs-indicator': {
                backgroundColor: activeIndicatorColor,
              },
            }}
          >
            {tabs.map((tab, index) => {
              const session = global.getSession(tab.sessionId);
              const sessionConnectionId = session.connectionId || '';
              const connectionColor = global.getConnectionColor(sessionConnectionId);
              const isLive = global.isConnectionLive(sessionConnectionId);
              return (
                <Tab
                  key={tab.sessionId}
                  tabIndex={-1} // Prevent tab focus
                  label={
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {sessionConnectionId && (
                        <span
                          title={isLive ? undefined : 'Assigned but not connected yet'}
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            backgroundColor: isLive ? connectionColor : 'transparent',
                            border: isLive ? 'none' : `1.5px solid ${connectionColor || 'var(--border-color)'}`,
                            boxSizing: 'border-box',
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      {(session.loading || session.connecting) && (
                        <CircularProgress size={12} sx={{ color: 'inherit' }} />
                      )}
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
                        sx={{
                          color: 'var(--icon-color)',
                          '&:hover': {
                            color: 'var(--text-color)',
                            backgroundColor: 'var(--node-bg)',
                          },
                        }}
                      >
                        <CloseOutlined sx={{ fontSize: '14px' }} tabIndex={-1} />
                      </IconButton>
                    </span>
                  }
                  value={tab.sessionId}
                />
              );
            })}
          </TabList>

          {/* Button to add new tab */}
          <AddCircle
            sx={{
              ml: 2,
              cursor: 'pointer',
              color: 'var(--primary-color)',
              '&:hover': {
                color: 'var(--primary-color-hover)',
              },
            }}
            onClick={addTab}
          />
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
