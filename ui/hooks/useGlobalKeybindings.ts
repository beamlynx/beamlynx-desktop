import { useEffect } from 'react';
import { Session } from '../store/session';
import { GlobalStore } from '../store/global.store';
import { KEYBINDINGS } from '../utils/keybindings';
import { getCommandById } from '../utils/commands';

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
          
          // Check if command is enabled before executing (for better UX)
          const command = getCommandById(config.commandId);
          if (command && command.isEnabled(global, session)) {
            global.executeCommand(config.commandId);
          }
          // If command is disabled, silently do nothing (like clicking a disabled button)
          return;
        }

         // Handle app-level keybindings with custom behavior
         // These cannot be simple commands for different reasons (see comments in each case)
         switch (config.name) {
           case 'select-all':
             // NOT a command: Needs KeyboardEvent to inspect event.target
             // and conditionally prevent default based on focus state
             const target = e.target as HTMLElement;
             if (
               target &&
               (target.tagName === 'INPUT' ||
                 target.tagName === 'TEXTAREA' ||
                 target.contentEditable === 'true')
             ) {
               return; // Allow native behavior in inputs
             }

             // Allow select-all when focused on the Pine input
             if (session.textInputFocused) {
               return; // Allow native behavior in Pine input
             }

             // Prevent default page selection in all other cases
             e.preventDefault();
             break;

           case 'reload':
             // NOT a command: Intentional no-op to preserve browser's native reload
             // Registering it ensures nothing else in our code accidentally intercepts it
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
