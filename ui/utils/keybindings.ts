/**
 * Keybindings registry
 *
 * This file defines all keyboard shortcuts in the application.
 * Keybindings can either:
 * 1. Map to a command ID (which gets executed via GlobalStore.executeCommand)
 * 2. Be app-level keybindings with custom behavior (like escape, select-all, reload)
 *
 * Some keybindings have a desktop-only "primary" binding and a browser
 * "fallback". This is needed because a real browser reserves combos like
 * Ctrl+T/Ctrl+W/Ctrl+K for its own chrome (new browser tab, close browser
 * tab, address bar) -- our JS never even sees the keydown there. Electron
 * has no browser chrome above our window, so those combos are free to use,
 * but the browser build (e.g. try.pine-lang.org) still needs a combo that
 * isn't fought over by the host browser, hence the existing Ctrl+Shift+P
 * for the command palette.
 */

import { isDesktop } from '../store/util';

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
const isMac =
  typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

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
        case 'ctrl':
          return '⌘'; // Command key on Mac (metaKey)
        case 'shift':
          return '⇧';
        case 'alt':
          return '⌥';
        default:
          return '';
      }
    });
    return symbols.join('') + key.toUpperCase();
  } else {
    const parts: string[] = modifiers.map(mod => {
      switch (mod) {
        case 'ctrl':
          return 'Ctrl';
        case 'shift':
          return 'Shift';
        case 'alt':
          return 'Alt';
        default:
          return '';
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
    name: 'command-palette',
    description: 'Open Command Palette',
    // Primary (desktop): Ctrl/Cmd+K. Fallback (browser): Ctrl/Cmd+Shift+P --
    // Ctrl+K is left alone in the browser since it's commonly reserved for
    // the address bar / search there.
    display: isDesktop()
      ? createKeybindingDisplay(['ctrl'], 'K')
      : createKeybindingDisplay(['ctrl', 'shift'], 'P'),
    matches: (e: KeyboardEvent) =>
      isDesktop()
        ? (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k'
        : (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p',
    commandId: 'command-palette',
  },

  {
    // Desktop-only: a real browser owns Ctrl/Cmd+T for its own new-tab
    // chrome, so there's no usable fallback there -- this stays unbound
    // (empty display, non-matching predicate) in the browser build, so the
    // Command Palette doesn't advertise a shortcut that can't fire there.
    name: 'new-tab',
    description: 'New Tab',
    display: isDesktop() ? createKeybindingDisplay(['ctrl'], 'T') : '',
    matches: (e: KeyboardEvent) =>
      isDesktop() && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 't',
    commandId: 'new-tab',
  },

  {
    // Desktop-only, same reasoning as new-tab above (Ctrl/Cmd+W closes the
    // host browser's own tab before our JS ever runs).
    name: 'close-tab',
    description: 'Close Tab',
    display: isDesktop() ? createKeybindingDisplay(['ctrl'], 'W') : '',
    matches: (e: KeyboardEvent) =>
      isDesktop() && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'w',
    commandId: 'close-tab',
  },

  {
    // Desktop-only, same reasoning as new-tab/close-tab above -- a real
    // browser (including on Mac) already owns Ctrl+Tab for cycling its own
    // tabs before our JS ever sees it. Literal `ctrlKey`, not `ctrlKey ||
    // metaKey` like most other combos here: real browsers keep this one as
    // Ctrl+Tab even on Mac (Cmd+Tab is the OS's own app-switcher, which
    // isn't ours to intercept), so matching only Ctrl is what makes this
    // "just like a browser" rather than a made-up combo. `display` is built
    // by hand rather than via createKeybindingDisplay, which always renders
    // 'ctrl' as ⌘ on Mac -- that would show the Command symbol for a
    // shortcut that only ever fires on the physical Control key.
    name: 'next-tab',
    description: 'Next Tab',
    display: isDesktop() ? (isMac ? '⌃⇥' : 'Ctrl+Tab') : '',
    matches: (e: KeyboardEvent) => isDesktop() && e.ctrlKey && !e.shiftKey && e.key === 'Tab',
    commandId: 'next-tab',
  },

  {
    name: 'previous-tab',
    description: 'Previous Tab',
    display: isDesktop() ? (isMac ? '⌃⇧⇥' : 'Ctrl+Shift+Tab') : '',
    matches: (e: KeyboardEvent) => isDesktop() && e.ctrlKey && e.shiftKey && e.key === 'Tab',
    commandId: 'previous-tab',
  },

  {
    // A second binding for the same command as next-tab above - real
    // browsers (Chrome and Firefox, Mac included) also accept Ctrl+PageDown
    // for the next tab, alongside Ctrl+Tab. No separate `display`: the
    // command palette shows whichever binding for a command it finds first
    // (getKeybindingDisplayForCommand), and next-tab's Ctrl+Tab entry above
    // already covers that - this one only needs to fire, not be advertised
    // twice.
    name: 'next-tab-pagedown',
    description: 'Next Tab (Ctrl+PageDown)',
    display: '',
    matches: (e: KeyboardEvent) => isDesktop() && e.ctrlKey && e.key === 'PageDown',
    commandId: 'next-tab',
  },

  {
    name: 'previous-tab-pageup',
    description: 'Previous Tab (Ctrl+PageUp)',
    display: '',
    matches: (e: KeyboardEvent) => isDesktop() && e.ctrlKey && e.key === 'PageUp',
    commandId: 'previous-tab',
  },

  {
    name: 'run-query',
    description: 'Run Query',
    display: createKeybindingDisplay(['ctrl'], 'Enter'),
    matches: (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && e.key === 'Enter',
    commandId: 'run-query',
  },

  {
    // Unlike new-tab/close-tab, Ctrl/Cmd+S's default ("Save Page As") is a
    // page-level browser action, not host-window chrome, so preventDefault()
    // on keydown reliably suppresses it in both the browser build and
    // desktop -- no desktop-only gating needed here.
    name: 'save-tab',
    description: 'Save Tab',
    display: createKeybindingDisplay(['ctrl'], 'S'),
    matches: (e: KeyboardEvent) =>
      (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's',
    commandId: 'save-tab',
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

  {
    // Ctrl/Cmd+. rather than Ctrl/Cmd+Shift+E: not reserved by any browser
    // chrome or (on macOS) any accelerator in beamlynx-desktop's own Electron
    // menu (see beamlynx-desktop/src/main/index.ts's buildMenu -- it only
    // defines About/Hide/Quit and a bare Edit menu, nothing on `.`/`,`), so
    // this reaches the page the same way on every platform -- no
    // isDesktop()/fallback split needed, unlike new-tab/close-tab above.
    name: 'toggle-pine-panel',
    description: 'Toggle Pine Panel (New Layout)',
    display: createKeybindingDisplay(['ctrl'], '.'),
    matches: (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === '.',
    commandId: 'toggle-pine-panel',
  },

  {
    // Shift of the Pine key above, not a separate key of its own -- Ctrl/
    // Cmd+, was wanted for Settings instead (see open-settings below), so
    // SQL's toggle moved here rather than contest that. Matches on `e.code`
    // (the physical key), not `e.key`: with Shift held, the period key's
    // `e.key` is '>', not '.' (it's the character the key produces, not the
    // key itself), so `e.shiftKey && e.key === '.'` can never actually fire
    // on a real keyboard -- same bug class open-settings below already hit
    // once with comma/'<'.
    name: 'toggle-sql-panel',
    description: 'Toggle SQL Panel (New Layout)',
    display: createKeybindingDisplay(['ctrl', 'shift'], '.'),
    matches: (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Period',
    commandId: 'toggle-sql-panel',
  },

  {
    // Cmd+, is macOS's own "Preferences" convention (Slack and most native
    // Mac apps use exactly this) -- only ever intercepted when some app menu
    // item actually binds that accelerator (typically `role: 'preferences'`),
    // and beamlynx-desktop's menu has no such item (see toggle-pine-panel's
    // comment above), so it isn't reserved here; free to mean the same thing
    // in this app as it does everywhere else.
    name: 'open-settings',
    description: 'Toggle Settings',
    display: createKeybindingDisplay(['ctrl'], ','),
    matches: (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === ',',
    commandId: 'open-settings',
  },

  // No dedicated key for toggle-zen-mode -- reachable via the command
  // palette only. Ctrl/Cmd+. and +, are both spoken for above, and nothing
  // else was requested for it.
];

/**
 * Get keybinding display string by command ID.
 * Returns undefined if no keybinding is mapped to this command.
 */
export function getKeybindingDisplayForCommand(commandId: string): string | undefined {
  const keybinding = KEYBINDINGS.find(config => config.commandId === commandId);
  return keybinding?.display || undefined;
}
