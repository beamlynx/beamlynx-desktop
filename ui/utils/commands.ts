import { GlobalStore } from '../store/global.store';
import { Session } from '../store/session';

export type CommandCategory = 'View' | 'Query' | 'Preferences' | 'Experimental' | 'Help';

/** Helper constant for commands that are always enabled */
export const ALWAYS_ENABLED = () => true;

export interface Command {
  id: string;
  label: string;
  category: CommandCategory;
  handler: () => void;
  /** If true, this command will not be shown in the command palette UI */
  hidden?: boolean;
  /** Function that determines if this command can currently execute */
  isEnabled: () => boolean;
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
      isEnabled: ALWAYS_ENABLED,
    },
    {
      id: 'toggle-vim-mode',
      label: 'Toggle Vim Mode',
      category: 'Preferences',
      handler: () => session.toggleVimMode(),
      isEnabled: ALWAYS_ENABLED,
    },
    {
      id: 'toggle-compact-mode',
      label: 'Toggle Compact Mode',
      category: 'Preferences',
      handler: () => global.toggleCompactMode(),
      isEnabled: ALWAYS_ENABLED,
    },

    // View Category
    {
      id: 'new-tab',
      label: 'New Tab',
      category: 'View',
      handler: () => global.addTab(),
      isEnabled: ALWAYS_ENABLED,
    },
    {
      id: 'close-tab',
      label: 'Close Tab',
      category: 'View',
      handler: () => global.closeTab(session.id),
      isEnabled: ALWAYS_ENABLED,
    },

    // Query Category
    {
      id: 'run-query',
      label: 'Run Query',
      category: 'Query',
      handler: () => session.evaluate(),
      isEnabled: () => !!(session.expression || session.query) && !session.loading,
    },

    // Hidden commands
    {
      id: 'command-palette',
      label: 'Open Command Palette',
      category: 'Preferences',
      handler: () => global.setShowCommandPalette(true),
      hidden: true,
      isEnabled: ALWAYS_ENABLED,
    },
    {
      id: 'focus-input',
      label: 'Focus on the Input Field',
      category: 'Preferences',
      handler: () => session.focusTextInput(),
      hidden: true,
      isEnabled: ALWAYS_ENABLED,
    },

    // Experimental Category
    {
      id: 'toggle-connection-monitor',
      label: 'Toggle Connection Monitor',
      category: 'Experimental',
      handler: () => {
        session.mode = session.mode === 'monitor' ? 'graph' : 'monitor';
      },
      isEnabled: ALWAYS_ENABLED,
    },
    {
      id: 'open-analysis',
      label: 'Open Analysis',
      category: 'Experimental',
      handler: () => global.setShowAnalysis(true),
      isEnabled: ALWAYS_ENABLED,
    },

    // Help Category
    {
      id: 'show-changelog',
      label: 'Show Changelog',
      category: 'Help',
      handler: () => global.setShowChangelog(true),
      isEnabled: ALWAYS_ENABLED,
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
    View: [],
    Query: [],
    Preferences: [],
    Experimental: [],
    Help: [],
  };

  allCommands.forEach(cmd => {
    grouped[cmd.category].push(cmd);
  });

  return grouped;
}

