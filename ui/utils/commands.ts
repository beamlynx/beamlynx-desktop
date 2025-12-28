import { GlobalStore } from '../store/global.store';
import { Session } from '../store/session';

export type CommandCategory = 'Preferences' | 'Query' | 'Experimental' | 'Help';

export interface Command {
  id: string;
  label: string;
  category: CommandCategory;
  handler: () => void;
  keybinding?: {
    display: string;
    matches: (e: KeyboardEvent) => boolean;
  };
}

/**
 * Get all available commands for the application.
 * This is the single source of truth for commands.
 * Both the command palette and global keybindings consume from this.
 */
export function getAllCommands(
  global: GlobalStore,
  session: Session,
  callbacks?: {
    openChangelog?: () => void;
  }
): Command[] {
  return [
    // Preferences Category
    {
      id: 'toggle-theme',
      label: 'Toggle Theme',
      category: 'Preferences',
      handler: () => global.toggleTheme(),
      keybinding: {
        display: 'Ctrl+Shift+T',
        matches: (e: KeyboardEvent) =>
          (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't',
      },
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
      handler: () => {
        if (callbacks?.openChangelog) {
          callbacks.openChangelog();
        }
      },
    },
  ];
}

/**
 * Get commands grouped by category
 */
export function getCommandsByCategory(
  global: GlobalStore,
  session: Session,
  callbacks?: {
    openChangelog?: () => void;
  }
): Record<CommandCategory, Command[]> {
  const allCommands = getAllCommands(global, session, callbacks);
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

