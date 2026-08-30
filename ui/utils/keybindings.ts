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
 *
 * Each keybinding matches via `combos`, plain data rather than a closure --
 * this is what makes the registry inspectable (e.g. for a future rebinding
 * UI or a which-key-style leader overlay) instead of a black box of
 * predicates. Most entries have exactly one combo; a few (command-palette)
 * have two, gated to different hosts, because desktop and browser use
 * genuinely different physical keys rather than one key that's simply
 * unavailable on one host (contrast with new-tab/close-tab/next-tab, which
 * have a single desktop-only combo and stay unbound in the browser build).
 */

import { isDesktop } from '../store/util';

/**
 * A single physical key combination. Every field is "don't care" when
 * omitted -- only set the modifiers a binding actually needs to check, to
 * avoid accidentally narrowing a match that the original code deliberately
 * left loose (e.g. run-query and select-all never checked Shift, so
 * Ctrl+Shift+Enter/Ctrl+Shift+A still trigger them).
 */
export interface KeyCombo {
  /** e.key, lowercased (e.g. 'k', 'enter', 'tab', 'pagedown', '.', ','). Ignored if `code` is set. */
  key?: string;
  /**
   * e.code, the physical key -- use instead of `key` when Shift changes the
   * character produced (e.g. 'Period', since Shift+period's e.key is '>',
   * not '.' -- matching `key` here was a real bug once, see toggle-sql-panel
   * below).
   */
  code?: string;
  /** ctrlKey || metaKey -- the platform "primary" modifier (Cmd on Mac, Ctrl elsewhere). */
  mod?: boolean;
  /** Literal ctrlKey only, distinct from `mod` -- for combos that must stay the physical Control key even on Mac (see next-tab below). */
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

interface ComboEntry {
  combo: KeyCombo;
  /** Restricts this combo to one host build; omit for "fires on both". */
  host?: 'desktop' | 'browser';
}

export interface KeybindingConfig {
  /** Unique identifier for this keybinding */
  name: string;
  /** Human-readable description of what this keybinding does */
  description: string;
  /** Visual representation shown in UI (e.g., "⌘⇧P" on Mac, "Ctrl+Shift+P" on Windows). Empty string = fires, but isn't advertised (see next-tab-pagedown below). */
  display: string;
  /** One or more combos that trigger this keybinding -- matches if any applicable-for-this-host combo matches the event. */
  combos: ComboEntry[];
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
 * Whether `host` (a combo's optional host gate) applies to the current build.
 * No `host` means "either host".
 */
function hostApplies(host: ComboEntry['host']): boolean {
  if (host === 'desktop') return isDesktop();
  if (host === 'browser') return !isDesktop();
  return true;
}

/** Whether a single KeyCombo matches a keydown event. Every set field must match; unset fields are "don't care". */
export function matchesCombo(e: KeyboardEvent, combo: KeyCombo): boolean {
  if (combo.code !== undefined) {
    if (e.code !== combo.code) return false;
  } else if (combo.key !== undefined) {
    if (e.key.toLowerCase() !== combo.key) return false;
  }
  if (combo.mod !== undefined && (e.ctrlKey || e.metaKey) !== combo.mod) return false;
  if (combo.ctrl !== undefined && e.ctrlKey !== combo.ctrl) return false;
  if (combo.shift !== undefined && e.shiftKey !== combo.shift) return false;
  if (combo.alt !== undefined && e.altKey !== combo.alt) return false;
  return true;
}

/** Whether a keydown event matches any of a keybinding's applicable-for-this-host combos. */
export function keybindingMatches(config: KeybindingConfig, e: KeyboardEvent): boolean {
  return config.combos.some(({ combo, host }) => hostApplies(host) && matchesCombo(e, combo));
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
    combos: [
      { host: 'desktop', combo: { mod: true, shift: false, key: 'k' } },
      { host: 'browser', combo: { mod: true, shift: true, key: 'p' } },
    ],
    commandId: 'command-palette',
  },

  {
    // Desktop-only: a real browser owns Ctrl/Cmd+T for its own new-tab
    // chrome, so there's no usable fallback there -- this stays unbound
    // (empty display, no browser combo) in the browser build, so the
    // Command Palette doesn't advertise a shortcut that can't fire there.
    name: 'new-tab',
    description: 'New Tab',
    display: isDesktop() ? createKeybindingDisplay(['ctrl'], 'T') : '',
    combos: [{ host: 'desktop', combo: { mod: true, shift: false, key: 't' } }],
    commandId: 'new-tab',
  },

  {
    // Desktop-only, same reasoning as new-tab above (Ctrl/Cmd+W closes the
    // host browser's own tab before our JS ever runs).
    name: 'close-tab',
    description: 'Close Tab',
    display: isDesktop() ? createKeybindingDisplay(['ctrl'], 'W') : '',
    combos: [{ host: 'desktop', combo: { mod: true, shift: false, key: 'w' } }],
    commandId: 'close-tab',
  },

  {
    // Desktop-only, same reasoning as new-tab/close-tab above -- a real
    // browser (including on Mac) already owns Ctrl+Tab for cycling its own
    // tabs before our JS ever sees it. Literal `ctrl`, not `mod`, like most
    // other combos here: real browsers keep this one as Ctrl+Tab even on Mac
    // (Cmd+Tab is the OS's own app-switcher, which isn't ours to intercept),
    // so matching only Ctrl is what makes this "just like a browser" rather
    // than a made-up combo. `display` is built by hand rather than via
    // createKeybindingDisplay, which always renders 'ctrl' as ⌘ on Mac --
    // that would show the Command symbol for a shortcut that only ever fires
    // on the physical Control key.
    name: 'next-tab',
    description: 'Next Tab',
    display: isDesktop() ? (isMac ? '⌃⇥' : 'Ctrl+Tab') : '',
    combos: [{ host: 'desktop', combo: { ctrl: true, shift: false, key: 'tab' } }],
    commandId: 'next-tab',
  },

  {
    name: 'previous-tab',
    description: 'Previous Tab',
    display: isDesktop() ? (isMac ? '⌃⇧⇥' : 'Ctrl+Shift+Tab') : '',
    combos: [{ host: 'desktop', combo: { ctrl: true, shift: true, key: 'tab' } }],
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
    combos: [{ host: 'desktop', combo: { ctrl: true, key: 'pagedown' } }],
    commandId: 'next-tab',
  },

  {
    name: 'previous-tab-pageup',
    description: 'Previous Tab (Ctrl+PageUp)',
    display: '',
    combos: [{ host: 'desktop', combo: { ctrl: true, key: 'pageup' } }],
    commandId: 'previous-tab',
  },

  {
    name: 'run-query',
    description: 'Run Query',
    display: createKeybindingDisplay(['ctrl'], 'Enter'),
    combos: [{ combo: { mod: true, key: 'enter' } }],
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
    combos: [{ combo: { mod: true, shift: false, key: 's' } }],
    commandId: 'save-tab',
  },

  // App-level keybindings
  {
    name: 'select-all',
    description: 'Prevent default page selection',
    display: createKeybindingDisplay(['ctrl'], 'A'),
    combos: [{ combo: { mod: true, key: 'a' } }],
  },

  {
    name: 'reload',
    description: 'Ensure browser reload always works',
    display: createKeybindingDisplay(['ctrl'], 'R'),
    combos: [{ combo: { mod: true, key: 'r' } }],
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
    combos: [{ combo: { mod: true, shift: false, key: '.' } }],
    commandId: 'toggle-pine-panel',
  },

  {
    // Shift of the Pine key above, not a separate key of its own -- Ctrl/
    // Cmd+, was wanted for Settings instead (see open-settings below), so
    // SQL's toggle moved here rather than contest that. Matches on `code`
    // (the physical key), not `key`: with Shift held, the period key's
    // `e.key` is '>', not '.' (it's the character the key produces, not the
    // key itself), so matching `key: '.'` with `shift: true` could never
    // actually fire on a real keyboard -- same bug class open-settings below
    // already hit once with comma/'<'.
    name: 'toggle-sql-panel',
    description: 'Toggle SQL Panel (New Layout)',
    display: createKeybindingDisplay(['ctrl', 'shift'], '.'),
    combos: [{ combo: { mod: true, shift: true, code: 'Period' } }],
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
    combos: [{ combo: { mod: true, shift: false, key: ',' } }],
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
