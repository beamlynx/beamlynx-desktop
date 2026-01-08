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
import { getAllCommands, Command, CommandCategory, CommandOption } from '../utils/commands';
import { getKeybindingDisplayForCommand } from '../utils/keybindings';

const CommandPalette = observer(() => {
  const { global } = useStores();
  const session = global.getSession(global.activeSessionId);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Two-stage mode state
  const [commandOptions, setCommandOptions] = useState<CommandOption[] | null>(null);
  const [parentCommand, setParentCommand] = useState<Command | null>(null);

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

  // Get recent commands (only if no search query) - filter out disabled ones
  const recentCommands = !searchQuery
    ? (global.commandHistory
        .map(id => allCommands.find(cmd => cmd.id === id))
        .filter((cmd): cmd is Command => Boolean(cmd) && cmd.isEnabled(global, session)))
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

  // Filter options by search query if in options mode
  const filteredOptions = commandOptions
    ? commandOptions.filter(
        opt =>
          opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          opt.detail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          opt.schema?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : [];

  useEffect(() => {
    if (global.showCommandPalette) {
      // Reset state when modal opens
      setSearchQuery('');
      setSelectedIndex(0);
      setCommandOptions(null);
      setParentCommand(null);

      // Focus the search input when modal opens
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [global.showCommandPalette]);

  // Update selected index when filtered items change
  useEffect(() => {
    const maxLength = commandOptions ? filteredOptions.length : flatCommands.length;
    if (selectedIndex >= maxLength) {
      setSelectedIndex(Math.max(0, maxLength - 1));
    }
  }, [flatCommands.length, filteredOptions.length, selectedIndex, commandOptions]);

  const handleClose = useCallback(() => {
    global.setShowCommandPalette(false);
  }, [global]);

  const executeCommand = async (command: Command) => {
    const result = command.handler(global, session);

    // Check if this is a two-stage command (returns options)
    if (result instanceof Promise) {
      const options = await result;
      if (options && Array.isArray(options) && options.length > 0) {
        // Enter two-stage mode: show options
        setCommandOptions(options);
        setParentCommand(command);
        setSearchQuery('');
        setSelectedIndex(0);
        return; // Don't close palette
      }
    }

    // Single-stage command or empty options: close palette and add to history
    global.addToCommandHistory(command.id);
    handleClose();
  };

  const executeOption = (option: CommandOption) => {
    option.handler(global, session);
    if (parentCommand) {
      global.addToCommandHistory(parentCommand.id);
    }
    handleClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const maxLength = commandOptions ? filteredOptions.length : flatCommands.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, maxLength - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (commandOptions) {
        // In options mode
        const option = filteredOptions[selectedIndex];
        if (option) executeOption(option);
      } else {
        // In commands mode
        const command = flatCommands[selectedIndex];
        if (command && command.isEnabled(global, session)) {
          executeCommand(command);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (commandOptions) {
        // Exit two-stage mode, return to commands
        setCommandOptions(null);
        setParentCommand(null);
        setSearchQuery('');
        setSelectedIndex(0);
      } else {
        handleClose();
      }
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
          placeholder="Search commands..."
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
              fontSize: '0.875rem', // Match button text size
            },
            '& .MuiInputBase-input': {
              fontSize: '0.875rem', // Match button text size
              padding: '10px 16px', // Slightly taller than button
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

        {/* Breadcrumb for two-stage mode */}
        {parentCommand && (
          <Box
            sx={{
              px: 2,
              py: 1,
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: 'var(--node-column-bg)',
            }}
          >
            <Typography variant="caption" sx={{ color: 'var(--text-color)', opacity: 0.7 }}>
              {parentCommand.label} → Select option
            </Typography>
          </Box>
        )}

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
          {/* Two-stage mode: Show options */}
          {commandOptions ? (
            filteredOptions.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography sx={{ color: 'var(--text-color)', opacity: 0.6 }}>
                  No options found
                </Typography>
              </Box>
            ) : (
              <List disablePadding>
                {filteredOptions.map((option, index) => {
                  const isSelected = index === selectedIndex;

                  return (
                    <ListItem
                      key={option.id}
                      data-index={index}
                      component="div"
                      onClick={() => executeOption(option)}
                      sx={{
                        px: 2,
                        py: 0.5,
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'var(--primary-color)' : 'transparent',
                        color: isSelected ? 'var(--primary-text-color)' : 'var(--text-color)',
                        '&:hover': {
                          backgroundColor: isSelected
                            ? 'var(--primary-color)'
                            : 'var(--node-column-bg)',
                        },
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                        <Typography
                          sx={{
                            color: 'inherit',
                            fontWeight: isSelected ? 500 : 400,
                            fontSize: '0.875rem',
                          }}
                        >
                          {option.label}
                        </Typography>
                        {option.schema && (
                          <Chip
                            label={option.schema}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.7rem',
                              backgroundColor: option.schemaColor,
                              color: '#000000',
                              border: 'none',
                              fontFamily: 'monospace',
                            }}
                          />
                        )}
                      </Box>
                    </ListItem>
                  );
                })}
              </List>
            )
          ) : groupedCommands.length === 0 && recentCommands.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography sx={{ color: 'var(--text-color)', opacity: 0.6 }}>
                No commands found
              </Typography>
            </Box>
          ) : (
            <>
              {/* Recent Commands Section */}
              {recentCommands.length > 0 && (
                <Box sx={{ mb: 0.5 }}>
                  {/* Recent Header */}
                  <Box
                    sx={{
                      px: 2,
                      py: 0.5,
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
                        fontSize: '0.75rem',
                        letterSpacing: '0.5px',
                      }}
                    >
                      Recent
                    </Typography>
                  </Box>

                  {/* Recent Commands */}
                  <List disablePadding>
                    {recentCommands.map((cmd, index) => {
                      const isSelected = index === selectedIndex;

                      return (
                        <ListItem
                          key={cmd.id}
                          data-index={index}
                          component="div"
                          onClick={() => executeCommand(cmd)}
                          sx={{
                            px: 2,
                            py: 0.5,
                            cursor: 'pointer',
                            backgroundColor: isSelected ? 'var(--primary-color)' : 'transparent',
                            color: isSelected ? 'var(--primary-text-color)' : 'var(--text-color)',
                            '&:hover': {
                              backgroundColor: isSelected
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
                                fontSize: '0.875rem', // Match button text size
                              },
                            }}
                          />
                          {commandKeybindings.get(cmd.id) && (
                            <Chip
                              label={commandKeybindings.get(cmd.id)}
                              size="small"
                              sx={{
                                height: 20,
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
                  <Box key={category} sx={{ mb: 0.5 }}>
                    {/* Category Header */}
                    <Box
                      sx={{
                        px: 2,
                        py: 0.5,
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
                          fontSize: '0.75rem',
                          letterSpacing: '0.5px',
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
                              py: 0.5,
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
                                  fontSize: '0.875rem', // Match button text size
                                },
                              }}
                            />
                            {commandKeybindings.get(cmd.id) && (
                              <Chip
                                label={commandKeybindings.get(cmd.id)}
                                size="small"
                                sx={{
                                  height: 20,
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
            py: 0.5,
            borderTop: '1px solid var(--border-color)',
            backgroundColor: 'var(--node-column-bg)',
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: 'var(--text-color)',
              opacity: 0.6,
              fontSize: '0.75rem',
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
