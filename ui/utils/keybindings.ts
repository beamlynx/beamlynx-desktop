/**
 * Keybindings registry
 * 
 * This file defines all keyboard shortcuts in the application.
 * Keybindings can either:
 * 1. Map to a command ID (which gets executed via GlobalStore.executeCommand)
 * 2. Be app-level keybindings with custom behavior (like escape, select-all, reload)
 */

export interface KeybindingConfig {
  /** Unique identifier for this keybinding */
  name: string;
  /** Human-readable description of what this keybinding does */
  description: string;
  /** Visual representation shown in UI (e.g., "⌘⇧P" on Mac, "Ctrl+Shift+P" on Windows) */
  display: string;
  /** Function that checks if the event matches this keybinding */
  matches: (e: KeyboardEvent) => boolean;
  /** Command ID to execute (if this keybinding triggers a command) */
  commandId?: string;
}

/**
 * Detect if the user is on macOS
 */
const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

/**
 * Create a platform-aware keybinding display string.
 * On Mac: uses Unicode symbols (⌘ ⇧ ⌥)
 *   - 'ctrl' modifier → ⌘ (Command key, since shortcuts use metaKey on Mac)
 *   - 'shift' modifier → ⇧ (Shift)
 *   - 'alt' modifier → ⌥ (Option)
 * On Windows/Linux: uses text (Ctrl, Shift, Alt)
 * 
 * @param modifiers - Array of modifier keys: 'ctrl', 'shift', 'alt'
 * @param key - The main key (e.g., 'P', 'T', 'A')
 * @returns Platform-appropriate display string
 */
function createKeybindingDisplay(modifiers: ('ctrl' | 'shift' | 'alt')[], key: string): string {
  if (isMac) {
    const symbols: string[] = modifiers.map(mod => {
      switch (mod) {
        case 'ctrl': return '⌘'; // Command key on Mac (metaKey)
        case 'shift': return '⇧';
        case 'alt': return '⌥';
        default: return '';
      }
    });
    return symbols.join('') + key.toUpperCase();
  } else {
    const parts: string[] = modifiers.map(mod => {
      switch (mod) {
        case 'ctrl': return 'Ctrl';
        case 'shift': return 'Shift';
        case 'alt': return 'Alt';
        default: return '';
      }
    });
    parts.push(key.toUpperCase());
    return parts.join('+');
  }
}

/**
 * Registry of all keybindings in the application.
 * 
 * NOTE: This is exported for internal use by useGlobalKeybindings hook.
 * External consumers should use getKeybindingDisplayForCommand() instead.
 */
export const KEYBINDINGS: KeybindingConfig[] = [
  // Command-triggering keybindings
  {
    name: 'toggle-theme',
    description: 'Toggle Theme',
    display: createKeybindingDisplay(['ctrl', 'shift'], 'T'),
    matches: (e: KeyboardEvent) =>
      (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't',
    commandId: 'toggle-theme',
  },

  {
    name: 'command-palette',
    description: 'Open Command Palette',
    display: createKeybindingDisplay(['ctrl', 'shift'], 'P'),
    matches: (e: KeyboardEvent) =>
      (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p',
    commandId: 'command-palette',
  },

  // Command-triggering keybinding
  {
    name: 'escape',
    description: 'Return focus to the Pine input field',
    display: 'Esc',
    matches: (e: KeyboardEvent) => e.key === 'Escape',
    commandId: 'focus-input',
  },

  // App-level keybindings
  {
    name: 'select-all',
    description: 'Prevent default page selection',
    display: createKeybindingDisplay(['ctrl'], 'A'),
    matches: (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && e.key === 'a',
  },

  {
    name: 'reload',
    description: 'Ensure browser reload always works',
    display: createKeybindingDisplay(['ctrl'], 'R'),
    matches: (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && e.key === 'r',
  },
];

/**
 * Get keybinding display string by command ID.
 * Returns undefined if no keybinding is mapped to this command.
 */
export function getKeybindingDisplayForCommand(commandId: string): string | undefined {
  const keybinding = KEYBINDINGS.find(config => config.commandId === commandId);
  return keybinding?.display;
}

