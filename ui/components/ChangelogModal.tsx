import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Typography,
  Box,
  Paper,
  Tabs,
  Tab,
} from '@mui/material';
import { CHANGELOG, ChangelogVersion, LATEST_VERSION } from '../utils/changelog.data';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from '../store/preferences';
import { compare } from 'semver';

// Helper function to format relative dates
const getRelativeDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  
  if (diffInDays === 0) {
    return 'Today';
  } else if (diffInDays === 1) {
    return 'Yesterday';
  } else if (diffInDays < 7) {
    return `${diffInDays} days ago`;
  } else if (diffInDays < 30) {
    const weeks = Math.floor(diffInDays / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  } else if (diffInDays < 365) {
    const months = Math.floor(diffInDays / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  } else {
    const years = Math.floor(diffInDays / 365);
    return years === 1 ? '1 year ago' : `${years} years ago`;
  }
};

interface ChangelogModalProps {
  open: boolean;
  onClose: () => void;
}

const ChangelogModal: React.FC<ChangelogModalProps> = ({ open, onClose }) => {
  const [lastReadVersion, setLastReadVersion] = useState('0.30.0');
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (open) {
      const stored = getUserPreference(STORAGE_KEYS.LAST_READ_VERSION, '0.30.0');
      setLastReadVersion(stored);
      
      // Determine which tab to show by default
      const newVersions = CHANGELOG.filter(version => 
        compare(version.version, stored) > 0
      );
      // If there are new updates, show "New" tab (0), otherwise show "Past" tab (1)
      setActiveTab(newVersions.length > 0 ? 0 : 1);
    }
  }, [open]);

  const handleClose = () => {
    // Mark the latest version as read
    setUserPreference(STORAGE_KEYS.LAST_READ_VERSION, LATEST_VERSION);
    onClose();
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Separate new updates from past updates
  const newUpdates = CHANGELOG.filter(version => 
    compare(version.version, lastReadVersion) > 0
  );
  const pastUpdates = CHANGELOG.filter(version => 
    compare(version.version, lastReadVersion) <= 0
  );

  const hasNewUpdates = newUpdates.length > 0;
  
  // Determine which updates to show based on active tab
  const displayUpdates = activeTab === 0 ? newUpdates : pastUpdates;

  const getSectionTitle = (section: string) => {
    switch (section) {
      case 'added':
        return 'Added';
      case 'changed':
        return 'Changed';
      case 'fixed':
        return 'Fixed';
      case 'security':
        return 'Security';
      case 'breaking':
        return 'Breaking Changes';
      default:
        return section;
    }
  };

  const getSectionColor = (section: string) => {
    switch (section) {
      case 'added':
        return '#4caf50'; // Green
      case 'changed':
        return '#2196f3'; // Blue
      case 'fixed':
        return '#ff9800'; // Orange
      case 'security':
        return '#9c27b0'; // Purple
      case 'breaking':
        return '#f44336'; // Red
      default:
        return 'var(--text-color)';
    }
  };

  const renderChangelogItem = (item: any, index: number) => (
    <Box key={index} sx={{ mb: 1.5, ml: 2 }}>
      <Typography variant="body2" sx={{ color: 'var(--text-color)', lineHeight: 1.6 }}>
        • {item.description}
      </Typography>
      {item.example && (
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            mt: 1,
            backgroundColor: 'var(--background-color)',
            border: '1px solid var(--border-color)',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            whiteSpace: 'pre-wrap',
            overflow: 'auto',
            color: 'var(--text-color)',
            borderRadius: 1,
          }}
        >
          {item.example}
        </Paper>
      )}
    </Box>
  );

  const renderVersion = (version: ChangelogVersion, index: number) => {
    const sections = ['added', 'changed', 'fixed', 'security', 'breaking'] as const;
    
    return (
      <Box key={version.version}>
        {index > 0 && (
          <Box sx={{ 
            height: '1px', 
            bgcolor: 'var(--border-color)', 
            opacity: 0.3,
            my: 4
          }} />
        )}
        
        <Box sx={{ mb: 3 }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'baseline',
            mb: 2.5,
            gap: 2
          }}>
            <Typography variant="h6" sx={{ 
              color: 'var(--text-color)',
              fontWeight: 600,
              fontSize: '1.05rem'
            }}>
              {getRelativeDate(version.date)}
            </Typography>
            <Typography variant="body2" sx={{ 
              color: 'var(--text-color)',
              opacity: 0.4,
              fontFamily: 'monospace',
              fontSize: '0.8rem'
            }}>
              {version.version}
            </Typography>
          </Box>
          
          {sections.map((section) => {
            const items = version[section];
            if (!items || items.length === 0) return null;
            
            return (
              <Box key={section} sx={{ mb: 2.5 }}>
                <Typography 
                  variant="subtitle2" 
                  sx={{ 
                    mb: 1.5,
                    color: getSectionColor(section),
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    opacity: 0.9
                  }}
                >
                  {getSectionTitle(section)}
                </Typography>
                {items.map((item, idx) => renderChangelogItem(item, idx))}
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      aria-labelledby="updates-modal-title"
    >
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '90vw',
          maxWidth: 800,
          height: '85vh',
          bgcolor: 'var(--background-color)',
          border: '1px solid var(--border-color)',
          boxShadow: 24,
          borderRadius: 2,
          outline: 'none',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ p: 3, borderBottom: '1px solid var(--border-color)' }}>
          <Typography variant="h6" component="h2" gutterBottom sx={{ color: 'var(--text-color)' }}>
            Updates
          </Typography>
        </Box>

        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          sx={{
            borderBottom: '1px solid var(--border-color)',
            px: 2,
            '& .MuiTab-root': {
              color: 'var(--text-color)',
              textTransform: 'none',
              minHeight: 48,
              fontSize: '0.95rem',
              fontWeight: 500,
              opacity: 0.6,
            },
            '& .Mui-selected': {
              color: 'var(--primary-color)',
              opacity: 1,
              fontWeight: 600,
            },
            '& .MuiTabs-indicator': {
              backgroundColor: 'var(--primary-color)',
              height: 3,
            },
          }}
        >
          <Tab label={`New ${newUpdates.length > 0 ? `(${newUpdates.length})` : ''}`} />
          <Tab label="Past" />
        </Tabs>

        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            px: 4,
            py: 3,
            '&::-webkit-scrollbar': {
              width: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'var(--border-color)',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: 'var(--text-color)',
              opacity: 0.5,
            },
          }}
        >
          {displayUpdates.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography variant="body2" sx={{ color: 'var(--text-color)', opacity: 0.5 }}>
                No updates to show
              </Typography>
            </Box>
          ) : (
            displayUpdates.map((version, index) => renderVersion(version, index))
          )}
        </Box>

        <Box
          sx={{
            borderTop: '1px solid var(--border-color)',
            p: 2,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Button
            variant="contained"
            onClick={handleClose}
            sx={{
              backgroundColor: 'var(--primary-color)',
              color: 'var(--primary-text-color)',
              textTransform: 'none',
              '&:hover': {
                backgroundColor: 'var(--primary-color-hover)',
              },
            }}
          >
            Close
          </Button>
        </Box>
      </Box>
    </Modal>
  );
};

export default ChangelogModal;
