import { GlobalStore } from '../store/global.store';
import { Session } from '../store/session';
import { getSchemaColor } from '../store/graph.util';

export type CommandCategory = 'View' | 'Query' | 'Preferences' | 'Experimental' | 'Help';

/** Helper constant for commands that are always enabled */
export const ALWAYS_ENABLED = (_global: GlobalStore, _session: Session) => true;

/**
 * Represents a selectable option in a two-stage command.
 * Used when a command needs to show dynamic choices (e.g., table selection).
 */
export interface CommandOption {
  id: string;
  label: string;
  /** Secondary info (e.g., "public.users" for disambiguation) */
  detail?: string;
  /** Schema name for table options */
  schema?: string;
  /** Color for the schema chip */
  schemaColor?: string;
  handler: (global: GlobalStore, session: Session) => void;
}

export interface Command {
  id: string;
  label: string;
  category: CommandCategory;
  /**
   * Command handler that can either:
   * - Execute immediately (return void) - single-stage command
   * - Return options for user selection (return Promise<CommandOption[]>) - two-stage command
   * - Execute async operation (return Promise) - single-stage async command
   */
  handler: (global: GlobalStore, session: Session) => void | Promise<any>;
  /** If true, this command will not be shown in the command palette UI */
  hidden?: boolean;
  /** Function that determines if this command can currently execute */
  isEnabled: (global: GlobalStore, session: Session) => boolean;
}

/**
 * All available commands for the application.
 * This is the single source of truth for commands.
 * Commands are defined once and receive global/session at execution time.
 */
const COMMANDS: Command[] = [
  // Preferences Category
  {
    id: 'toggle-theme',
    label: 'Toggle Theme',
    category: 'Preferences',
    handler: global => global.toggleTheme(),
    isEnabled: ALWAYS_ENABLED,
  },
  {
    id: 'toggle-vim-mode',
    label: 'Toggle Vim Mode',
    category: 'Preferences',
    handler: (_global, session) => session.toggleVimMode(),
    isEnabled: ALWAYS_ENABLED,
  },
  {
    id: 'toggle-compact-mode',
    label: 'Toggle Compact Mode',
    category: 'Preferences',
    handler: global => global.toggleCompactMode(),
    isEnabled: ALWAYS_ENABLED,
  },

  // View Category
  {
    id: 'new-tab',
    label: 'New Tab',
    category: 'View',
    handler: global => global.addTab(),
    isEnabled: ALWAYS_ENABLED,
  },
  {
    id: 'close-tab',
    label: 'Close Tab',
    category: 'View',
    handler: (global, session) => global.closeTab(session.id),
    isEnabled: ALWAYS_ENABLED,
  },

  // Query Category
  {
    id: 'run-query',
    label: 'Run Query',
    category: 'Query',
    handler: (_global, session) => session.evaluate(),
    isEnabled: (_global, session) => !!(session.expression || session.query) && !session.loading,
  },

  // Hidden commands
  {
    id: 'select-table',
    hidden: true, // Temporarily hiding it until the functionality is full implemented
    label: 'Select Table',
    category: 'Query',
    handler: async (global, session) => {
      // Use virtual session to build from current session expression
      const vs = global.getVirtualSession();
      const ast = await vs.build(session.expression);
      const tableHints = ast.hints.table;

      // Get theme for schema colors
      const isDark = global.theme === 'dark';

      // Create options from table hints
      return tableHints.map(hint => {
        const { color } = getSchemaColor(hint.schema, isDark);
        return {
          id: hint.pine,
          label: hint.table, // Show table name
          schema: hint.schema, // Include schema for chip
          schemaColor: color, // Include color for chip
          handler: (global: GlobalStore, session: Session) => {
            // Insert table as first expression
            session.appendAndUpdateExpression(hint.pine);
            // session.expression = `${hint.pine}`;
            // session.prettify(true);
            // session.focusTextInput();
          },
        };
      });
    },
    isEnabled: (_global, session) => session.expression.trim() === '',
  },
  {
    id: 'command-palette',
    label: 'Open Command Palette',
    category: 'Preferences',
    handler: global => global.setShowCommandPalette(true),
    hidden: true,
    isEnabled: ALWAYS_ENABLED,
  },
  {
    id: 'focus-input',
    label: 'Focus on the Input Field',
    category: 'Preferences',
    handler: (_global, session) => session.focusTextInput(),
    hidden: true,
    isEnabled: ALWAYS_ENABLED,
  },

  // Experimental Category
  {
    id: 'toggle-connection-monitor',
    label: 'Toggle Connection Monitor',
    category: 'Experimental',
    handler: (_global, session) => {
      session.mode = session.mode === 'monitor' ? 'graph' : 'monitor';
    },
    isEnabled: ALWAYS_ENABLED,
  },
  {
    id: 'open-analysis',
    label: 'Open Analysis',
    category: 'Experimental',
    handler: global => global.setShowAnalysis(true),
    isEnabled: ALWAYS_ENABLED,
  },

  // Help Category
  {
    id: 'show-changelog',
    label: 'Show Changelog',
    category: 'Help',
    handler: global => global.setShowChangelog(true),
    isEnabled: ALWAYS_ENABLED,
  },
];

/**
 * Pre-indexed map of commands by ID for O(1) lookup
 */
const COMMANDS_MAP = new Map<string, Command>(COMMANDS.map(cmd => [cmd.id, cmd]));

/**
 * Get all available commands for the application.
 * Returns the same array every time (no recreation).
 */
export function getAllCommands(): Command[] {
  return COMMANDS;
}

/**
 * Get a single command by its ID.
 * O(1) lookup using pre-indexed map.
 *
 * @param commandId The unique identifier of the command
 * @returns The command if found, undefined otherwise
 */
export function getCommandById(commandId: string): Command | undefined {
  return COMMANDS_MAP.get(commandId);
}

/**
 * Get commands grouped by category
 */
export function getCommandsByCategory(): Record<CommandCategory, Command[]> {
  const allCommands = getAllCommands();
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
