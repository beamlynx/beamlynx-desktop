import { GlobalStore } from '../store/global.store';
import { Session } from '../store/session';

export type CommandCategory = 'Preferences' | 'Query' | 'Experimental' | 'Help';

export interface Command {
  id: string;
  label: string;
  category: CommandCategory;
  handler: () => void;
  /** If true, this command will not be shown in the command palette UI */
  hidden?: boolean;
}

/**
 * Get all available commands for the application.
 * This is the single source of truth for commands.
 * Both the command palette and global keybindings consume from this.
 */
export function getAllCommands(
  global: GlobalStore,
  session: Session
): Command[] {
  return [
    // Preferences Category
    {
      id: 'toggle-theme',
      label: 'Toggle Theme',
      category: 'Preferences',
      handler: () => global.toggleTheme(),
    },
    {
      id: 'toggle-vim-mode',
      label: 'Toggle Vim Mode',
      category: 'Preferences',
      handler: () => session.toggleVimMode(),
    },
    {
      id: 'toggle-compact-mode',
      label: 'Toggle Compact Mode',
      category: 'Preferences',
      handler: () => global.toggleCompactMode(),
    },
    {
      id: 'toggle-connection-monitor',
      label: 'Toggle Connection Monitor',
      category: 'Preferences',
      handler: () => {
        session.mode = session.mode === 'monitor' ? 'graph' : 'monitor';
      },
    },
    // Hidden commands
    {
      id: 'command-palette',
      label: 'Open Command Palette',
      category: 'Preferences',
      handler: () => global.setShowCommandPalette(true),
      hidden: true,
    },
    {
      id: 'focus-input',
      label: 'Focus on the Input Field',
      category: 'Preferences',
      handler: () => session.focusTextInput(),
      hidden: true,
    },

    // Experimental Category
    {
      id: 'open-analysis',
      label: 'Open Analysis',
      category: 'Experimental',
      handler: () => global.setShowAnalysis(true),
    },

    // Help Category
    {
      id: 'show-changelog',
      label: 'Show Changelog',
      category: 'Help',
      handler: () => global.setShowChangelog(true),
    },
  ];
}

/**
 * Get commands grouped by category
 */
export function getCommandsByCategory(
  global: GlobalStore,
  session: Session
): Record<CommandCategory, Command[]> {
  const allCommands = getAllCommands(global, session);
  const grouped: Record<CommandCategory, Command[]> = {
    Preferences: [],
    Query: [],
    Experimental: [],
    Help: [],
  };

  allCommands.forEach(cmd => {
    grouped[cmd.category].push(cmd);
  });

  return grouped;
}

