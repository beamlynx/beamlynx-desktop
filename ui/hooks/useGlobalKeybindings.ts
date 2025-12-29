import { useEffect } from 'react';
import { Session } from '../store/session';
import { GlobalStore } from '../store/global.store';
import { KEYBINDINGS } from '../utils/keybindings';

interface GlobalKeybindingsProps {
  session: Session;
  global: GlobalStore;
}

/**
 * Global keyboard shortcuts that work application-wide regardless of focus state.
 *
 * These are different from input-specific shortcuts (like Ctrl+Enter) which only
 * work when the input is focused.
 */
export const useGlobalKeybindings = ({ session, global }: GlobalKeybindingsProps) => {
  /**
   * Set up event listeners for all configured keybindings.
   * Uses a single useEffect with a combined handler for better React compliance.
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check all keybindings from the registry
      KEYBINDINGS.forEach(config => {
        if (!config.matches(e)) return;

        // If this keybinding has a command ID, execute the command
        if (config.commandId) {
          e.preventDefault();
          global.executeCommand(config.commandId);
          return;
        }

         // Handle app-level keybindings with custom behavior
         switch (config.name) {
           case 'select-all':
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
            break;

          case 'reload':
            // Always allow browser reload - don't prevent or stop this event
            // This ensures reload works even if other extensions try to intercept it
            return;
        }
      });
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [global, session]);
};
