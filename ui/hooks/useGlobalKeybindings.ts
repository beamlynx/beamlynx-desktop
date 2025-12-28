import { useEffect, useMemo } from 'react';
import { Session } from '../store/session';
import { GlobalStore } from '../store/global.store';
import { getAllCommands } from '../utils/commands';

interface GlobalKeybindingsProps {
  session: Session;
  global: GlobalStore;
  focusInput?: () => void;
  callbacks?: {
    openChangelog?: () => void;
  };
}

interface KeybindingConfig {
  /** Human-readable description of what this keybinding does */
  description: string;
  /** Function that checks if the event matches this keybinding */
  matches: (e: KeyboardEvent) => boolean;
  /** Function that handles the keybinding action */
  handler: (e: KeyboardEvent) => void;
  /** Dependencies for useEffect - when these change, the handler will be recreated */
  dependencies: React.DependencyList;
}

/**
 * Global keyboard shortcuts that work application-wide regardless of focus state.
 *
 * These are different from input-specific shortcuts (like Ctrl+Enter) which only
 * work when the input is focused.
 */
export const useGlobalKeybindings = ({ session, global, focusInput, callbacks }: GlobalKeybindingsProps) => {
  // Get all commands from the registry
  const commands = useMemo(() => getAllCommands(global, session, callbacks), [global, session, callbacks]);

  /**
   * Configuration object for all global keybindings.
   * Each key represents a unique keybinding name, and the value contains
   * the matching logic, handler function, and dependencies.
   */
  const keybindings = useMemo(
    (): Record<string, KeybindingConfig> => ({
      escape: {
        description: 'Return focus to the Pine input field',
        matches: e => e.key === 'Escape',
        handler: e => {
          if (!focusInput) return;
          focusInput();
        },
        dependencies: [focusInput],
      },

      selectAll: {
        description: 'Prevent default page selection with Ctrl+A (Windows/Linux) or Cmd+A (Mac)',
        matches: e => (e.ctrlKey || e.metaKey) && e.key === 'a',
        handler: e => {
          // Allow select-all in any regular text input (including modals)
          const target = e.target as HTMLElement;
          if (
            target &&
            (target.tagName === 'INPUT' ||
              target.tagName === 'TEXTAREA' ||
              target.contentEditable === 'true')
          ) {
            return;
          }

          // Allow select-all when focused on the Pine input
          if (session.textInputFocused) {
            return;
          }

          // Prevent default page selection
          e.preventDefault();
        },
        dependencies: [session.textInputFocused],
      },

      reload: {
        description: 'Ensure browser reload with Ctrl+R (Windows/Linux) or Cmd+R (Mac) always works',
        matches: e => (e.ctrlKey || e.metaKey) && e.key === 'r',
        handler: e => {
          // Always allow browser reload - don't prevent or stop this event
          // This ensures reload works even if other extensions try to intercept it
          return;
        },
        dependencies: [],
      },

      commandPalette: {
        description: 'Open command palette with Ctrl+Shift+P (Windows/Linux) or Cmd+Shift+P (Mac)',
        matches: e => (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p',
        handler: e => {
          e.preventDefault();
          global.setShowCommandPalette(true);
        },
        dependencies: [global],
      },
    }),
    [focusInput, session.textInputFocused, global],
  );

  /**
   * Set up event listeners for all configured keybindings.
   * Uses a single useEffect with a combined handler for better React compliance.
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // First check custom keybindings (like escape, selectAll, reload, commandPalette)
      Object.values(keybindings).forEach(config => {
        if (config.matches(e)) {
          config.handler(e);
        }
      });

      // Then check command keybindings from registry
      commands.forEach(cmd => {
        if (cmd.keybinding?.matches(e)) {
          e.preventDefault();
          cmd.handler();
        }
      });
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [keybindings, commands]);
};
