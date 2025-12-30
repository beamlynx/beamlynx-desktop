import {
  Box,
  Modal,
  TextField,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
} from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useStores } from '../store/store-container';
import { getAllCommands, Command, CommandCategory } from '../utils/commands';
import { getKeybindingDisplayForCommand } from '../utils/keybindings';

const CommandPalette = observer(() => {
  const { global } = useStores();
  const session = global.getSession(global.activeSessionId);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Get all commands and filter out hidden ones
  const allCommands = getAllCommands().filter(cmd => !cmd.hidden);

  // Create a map of command ID to keybinding display for efficient lookup
  const commandKeybindings = useMemo(() => {
    const map = new Map<string, string>();
    allCommands.forEach(cmd => {
      const keybindingDisplay = getKeybindingDisplayForCommand(cmd.id);
      if (keybindingDisplay) {
        map.set(cmd.id, keybindingDisplay);
      }
    });
    return map;
  }, [allCommands]);

  // Filter commands based on search query
  const filteredCommands = searchQuery
    ? allCommands.filter(cmd => cmd.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : allCommands;

  // Get recent commands (only if no search query)
  const recentCommands = !searchQuery
    ? (global.commandHistory
        .map(id => allCommands.find(cmd => cmd.id === id))
        .filter(Boolean) as Command[])
    : [];

  // Group filtered commands by category
  const groupedCommands: { category: CommandCategory; commands: Command[] }[] = [];
  const categoryOrder: CommandCategory[] = ['View', 'Query', 'Preferences', 'Help', 'Experimental'];

  categoryOrder.forEach(category => {
    const commands = filteredCommands.filter(cmd => cmd.category === category);
    if (commands.length > 0) {
      groupedCommands.push({ category, commands });
    }
  });

  // Flatten for keyboard navigation (include recent commands if showing them)
  const flatCommands =
    recentCommands.length > 0
      ? [...recentCommands, ...groupedCommands.flatMap(group => group.commands)]
      : groupedCommands.flatMap(group => group.commands);

  useEffect(() => {
    if (global.showCommandPalette) {
      // Reset state when modal opens
      setSearchQuery('');
      setSelectedIndex(0);

      // Focus the search input when modal opens
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [global.showCommandPalette]);

  // Update selected index when filtered commands change
  useEffect(() => {
    if (selectedIndex >= flatCommands.length) {
      setSelectedIndex(Math.max(0, flatCommands.length - 1));
    }
  }, [flatCommands.length, selectedIndex]);

  const handleClose = useCallback(() => {
    global.setShowCommandPalette(false);
  }, [global]);

  const executeCommand = (command: Command) => {
    global.executeCommand(command.id);
    handleClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, flatCommands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const command = flatCommands[selectedIndex];
      if (command && command.isEnabled(global, session)) {
        executeCommand(command);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  };

  // Auto-scroll selected item into view
  useEffect(() => {
    const selectedElement = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  return (
    <Modal
      open={global.showCommandPalette}
      onClose={handleClose}
      aria-labelledby="command-palette-title"
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '8px',
      }}
      slotProps={{
        backdrop: {
          sx: {
            // backgroundColor: 'rgba(0, 0, 0, 0.3)',
            backgroundColor: 'rgba(0, 0, 0, 0)',
          },
        },
      }}
    >
      <Box
        sx={{
          width: 600,
          maxWidth: '90vw',
          bgcolor: 'var(--background-color)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          borderRadius: 1, // Match search box (4px)
          outline: 'none',
          maxHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          // animation: 'slideDown 0.15s ease-out',
          '@keyframes slideDown': {
            '0%': {
              opacity: 0,
              transform: 'translateY(-10px)',
            },
            '100%': {
              opacity: 1,
              transform: 'translateY(0)',
            },
          },
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <TextField
          fullWidth
          placeholder="Type a command..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          inputRef={searchInputRef}
          variant="outlined"
          size="small"
          autoComplete="off"
          sx={{
            '& .MuiInputBase-root': {
              color: 'var(--text-color)',
              backgroundColor: 'var(--node-column-bg)',
              borderRadius: '4px 4px 0 0', // Match search box border radius (4px at top)
            },
            '& .MuiOutlinedInput-root': {
              '& fieldset': {
                borderColor: 'var(--border-color)',
                borderBottom: '1px solid var(--border-color)',
              },
              '&:hover fieldset': { borderColor: 'var(--text-color)' },
              '&.Mui-focused fieldset': { borderColor: 'var(--primary-color)' },
            },
          }}
        />

        {/* Commands List */}
        <Box
          ref={listRef}
          sx={{
            overflowY: 'auto',
            flex: 1,
            minHeight: 0,
            // Custom scrollbar styling
            '&::-webkit-scrollbar': {
              width: '8px',
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: 'var(--background-color)',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: 'var(--border-color)',
              borderRadius: '4px',
              '&:hover': {
                backgroundColor: 'var(--text-color)',
                opacity: 0.5,
              },
            },
          }}
        >
          {groupedCommands.length === 0 && recentCommands.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography sx={{ color: 'var(--text-color)', opacity: 0.6 }}>
                No commands found
              </Typography>
            </Box>
          ) : (
            <>
              {/* Recent Commands Section */}
              {recentCommands.length > 0 && (
                <Box sx={{ mb: 1 }}>
                  {/* Recent Header */}
                  <Box
                    sx={{
                      px: 2,
                      py: 1,
                      backgroundColor: 'var(--node-column-bg)',
                      borderBottom: '1px solid var(--border-color)',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'var(--text-color)',
                        opacity: 0.7,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        fontSize: '0.7rem',
                      }}
                    >
                      Recent
                    </Typography>
                  </Box>

                  {/* Recent Commands */}
                  <List disablePadding>
                    {recentCommands.map((cmd, index) => {
                      const isSelected = index === selectedIndex;
                      const isDisabled = !cmd.isEnabled(global, session);

                      return (
                        <ListItem
                          key={cmd.id}
                          data-index={index}
                          component="div"
                          onClick={() => !isDisabled && executeCommand(cmd)}
                          sx={{
                            px: 2,
                            py: 1.5,
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            backgroundColor: isSelected ? 'var(--primary-color)' : 'transparent',
                            color: isSelected ? 'var(--primary-text-color)' : 'var(--text-color)',
                            opacity: isDisabled ? 0.5 : 1,
                            '&:hover': {
                              backgroundColor: isDisabled
                                ? 'transparent'
                                : isSelected
                                  ? 'var(--primary-color)'
                                  : 'var(--node-column-bg)',
                            },
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <ListItemText
                            primary={cmd.label}
                            primaryTypographyProps={{
                              sx: {
                                color: 'inherit',
                                fontWeight: isSelected ? 500 : 400,
                              },
                            }}
                          />
                          {commandKeybindings.get(cmd.id) && (
                            <Chip
                              label={commandKeybindings.get(cmd.id)}
                              size="small"
                              sx={{
                                height: 22,
                                fontSize: '0.7rem',
                                backgroundColor: isSelected
                                  ? 'rgba(255, 255, 255, 0.2)'
                                  : 'var(--node-column-bg)',
                                color: isSelected
                                  ? 'var(--primary-text-color)'
                                  : 'var(--text-color)',
                                border: '1px solid',
                                borderColor: isSelected
                                  ? 'rgba(255, 255, 255, 0.3)'
                                  : 'var(--border-color)',
                                fontFamily: 'monospace',
                              }}
                            />
                          )}
                        </ListItem>
                      );
                    })}
                  </List>
                </Box>
              )}

              {/* Category Commands */}
              {groupedCommands.map(({ category, commands }) => {
                // Calculate the starting index for this category (account for recent commands)
                const categoryStartIndex =
                  recentCommands.length +
                  flatCommands
                    .slice(recentCommands.length)
                    .findIndex(cmd => cmd.category === category);

                return (
                  <Box key={category} sx={{ mb: 1 }}>
                    {/* Category Header */}
                    <Box
                      sx={{
                        px: 2,
                        py: 1,
                        backgroundColor: 'var(--node-column-bg)',
                        borderBottom: '1px solid var(--border-color)',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'var(--text-color)',
                          opacity: 0.7,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          fontSize: '0.7rem',
                        }}
                      >
                        {category}
                      </Typography>
                    </Box>

                    {/* Category Commands */}
                    <List disablePadding>
                      {commands.map((cmd, index) => {
                        const commandIndex = categoryStartIndex + index;
                        const isSelected = commandIndex === selectedIndex;
                        const isDisabled = !cmd.isEnabled(global, session);

                        return (
                          <ListItem
                            key={cmd.id}
                            data-index={commandIndex}
                            component="div"
                            onClick={() => !isDisabled && executeCommand(cmd)}
                            sx={{
                              px: 2,
                              py: 1.5,
                              cursor: isDisabled ? 'not-allowed' : 'pointer',
                              backgroundColor: isSelected ? 'var(--primary-color)' : 'transparent',
                              color: isSelected ? 'var(--primary-text-color)' : 'var(--text-color)',
                              opacity: isDisabled ? 0.5 : 1,
                              '&:hover': {
                                backgroundColor: isDisabled
                                  ? 'transparent'
                                  : isSelected
                                    ? 'var(--primary-color)'
                                    : 'var(--node-column-bg)',
                              },
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <ListItemText
                              primary={cmd.label}
                              primaryTypographyProps={{
                                sx: {
                                  color: 'inherit',
                                  fontWeight: isSelected ? 500 : 400,
                                },
                              }}
                            />
                            {commandKeybindings.get(cmd.id) && (
                              <Chip
                                label={commandKeybindings.get(cmd.id)}
                                size="small"
                                sx={{
                                  height: 22,
                                  fontSize: '0.7rem',
                                  backgroundColor: isSelected
                                    ? 'rgba(255, 255, 255, 0.2)'
                                    : 'var(--node-column-bg)',
                                  color: isSelected
                                    ? 'var(--primary-text-color)'
                                    : 'var(--text-color)',
                                  border: '1px solid',
                                  borderColor: isSelected
                                    ? 'rgba(255, 255, 255, 0.3)'
                                    : 'var(--border-color)',
                                  fontFamily: 'monospace',
                                }}
                              />
                            )}
                          </ListItem>
                        );
                      })}
                    </List>
                  </Box>
                );
              })}
            </>
          )}
        </Box>

        {/* Footer hint */}
        <Box
          sx={{
            px: 2,
            py: 1,
            borderTop: '1px solid var(--border-color)',
            backgroundColor: 'var(--node-column-bg)',
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: 'var(--text-color)',
              opacity: 0.6,
              fontSize: '0.7rem',
            }}
          >
            Use ↑↓ to navigate • Enter to select • Esc to close
          </Typography>
        </Box>
      </Box>
    </Modal>
  );
});

export default CommandPalette;
