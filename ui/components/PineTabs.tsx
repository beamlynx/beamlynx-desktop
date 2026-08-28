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
    global.getConnectionColor(activeConnectionId) || 'var(--canvas-node-border)';

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
    <Box
      sx={{
        width: '100%',
        mt: 0,
        pt: 0,
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TabContext value={sessionId}>
        {/* Hidden in Zen mode -- the tab strip is exactly the kind of "app
            chrome" a graph-only view is meant to hide; the TabPanels below
            (the actual session content) stay mounted either way. */}
        {!global.isZenModeActive && (
          <Box
            sx={{
              backgroundColor: 'var(--canvas-node-bg)',
              borderBottom: '1px solid var(--canvas-node-border)',
              display: 'flex',
              alignItems: 'center',
              mt: 0,
              flexShrink: 0,
            }}
          >
            <TabList
              onChange={handleChange}
              sx={{
                '& .MuiTab-root': {
                  color: 'var(--canvas-text-dim)',
                  fontFamily: 'var(--canvas-font)',
                  minHeight: 40,
                  '&.Mui-selected': {
                    color: 'var(--canvas-trace)',
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
                              border: isLive
                                ? 'none'
                                : `1.5px solid ${connectionColor || 'var(--canvas-node-border)'}`,
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
                            color: 'var(--canvas-text-dim)',
                            '&:hover': {
                              color: 'var(--canvas-text)',
                              backgroundColor: 'var(--canvas-chip-bg)',
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
                color: 'var(--canvas-trace)',
                '&:hover': {
                  color: 'var(--canvas-node-border-current)',
                },
              }}
              onClick={addTab}
            />
          </Box>
        )}

        {tabs.map(tab => (
          <TabPanel
            key={tab.sessionId}
            // The flex/display overrides only apply to the ACTIVE tab's
            // panel. MUI's TabPanel keeps one <div hidden> per inactive tab
            // in the DOM too (only its children are unmounted) - giving
            // every one of those `display: 'flex'` as well would override
            // the native [hidden] attribute's display:none (an sx-generated
            // class beats the UA stylesheet's attribute selector), making
            // every inactive tab's empty panel participate in this flex row
            // instead of being invisible and out of layout.
            sx={
              tab.sessionId === sessionId
                ? { padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
                : { padding: 0 }
            }
            value={tab.sessionId}
          >
            <Session sessionId={tab.sessionId}></Session>
          </TabPanel>
        ))}
      </TabContext>
    </Box>
  );
});

export default PineTabs;
