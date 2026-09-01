import { useEffect } from 'react';
import { GlobalStore } from '../store/global.store';
import { isDesktop } from '../store/util';
import { RAIL_ITEMS, DESKTOP_ONLY_SECTIONS } from '../components/settings/SettingsPanelContent';

interface SettingsKeybindingsProps {
  global: GlobalStore;
}

// Input types a keystroke never types into or steps through -- a letter does
// nothing on any of these, and Arrow Up/Down don't step a value the way they
// do on e.g. a number/date input. Everything else (an absent `type`
// defaults to 'text', plus 'search'/'email'/'password'/'tel'/'url'/'number'/
// date-and-time types) is a real typing/stepping target and must keep
// winning over rail navigation.
const NON_TYPING_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'range',
  'color',
  'file',
  'image',
  'hidden',
]);

/**
 * Whether a keystroke landing on `target` would be consumed by the element
 * itself (typed into a text field, or stepped by a number/date input's own
 * arrows) rather than being free for rail navigation to interpret. Narrower
 * than a blanket `input, textarea, [contenteditable]` check -- that matched
 * MUI Switch's own underlying `<input type="checkbox">` too, which is why
 * j/k (and even Arrow Up/Down) stopped moving the rail the instant a toggle
 * in Preferences had focus (confirmed live) even though a checkbox consumes
 * neither.
 */
function isTypingTarget(target: Element | null): boolean {
  if (!target) return false;
  if (target.closest('textarea, [contenteditable="true"]')) return true;
  const input = target.closest('input');
  if (!input) return false;
  const type = (input.getAttribute('type') || 'text').toLowerCase();
  return !NON_TYPING_INPUT_TYPES.has(type);
}

/**
 * Arrow Up/Down (always) and vim-style j/k (only with Vim keybindings on)
 * navigation over the Settings rail -- mirrors useCanvasKeybindings.ts's
 * structure (single document-level keydown listener, gated on which panel
 * currently owns bare-key input) but is its own hook rather than an addition
 * to that one, same reasoning as that file's own doc comment: these are
 * single bare letters, which only make sense to interpret while
 * GlobalStore.activeKeyboardPanel === 'settings'.
 *
 * No Escape-to-close here -- SettingsPanelContent.tsx already documents that
 * as a deliberate omission (a docked panel isn't in anyone's way, and Escape
 * is needed elsewhere, e.g. closing a picker), and this hook isn't
 * revisiting that decision.
 */
export const useSettingsKeybindings = ({ global }: SettingsKeybindingsProps) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (global.activeKeyboardPanel !== 'settings') return;

      // Belt-and-suspenders, matching useCanvasKeybindings.ts's own check --
      // Settings uses plain MUI inputs (text fields, search boxes), not
      // CodeMirror, so there's no textInputFocused-style flag to lean on
      // here the way the canvas hook does; the DOM check alone is enough.
      const target = e.target instanceof Element ? e.target : null;
      if (isTypingTarget(target)) return;

      const navigableItems = RAIL_ITEMS.filter(item => !DESKTOP_ONLY_SECTIONS.includes(item.id) || isDesktop());
      const currentIndex = navigableItems.findIndex(item => item.id === global.settingsSection);
      const moveTo = (item: (typeof navigableItems)[number] | undefined) => {
        e.preventDefault();
        if (item) global.setSettingsSection(item.id);
      };

      // Arrow keys always work -- plain directional navigation, not a vim
      // convention, same reasoning as useCanvasKeybindings.ts's identical
      // split (and the same bug this mirrors: confirmed live that j/k
      // moved the rail with Vim keybindings off, which the canvas side of
      // this exact feature already got right).
      switch (e.key) {
        case 'ArrowDown':
          moveTo(navigableItems[Math.min(currentIndex + 1, navigableItems.length - 1)]);
          return;
        case 'ArrowUp':
          moveTo(navigableItems[Math.max(currentIndex - 1, 0)]);
          return;
      }

      if (!global.vimMode) return;

      switch (e.key) {
        case 'j':
          moveTo(navigableItems[Math.min(currentIndex + 1, navigableItems.length - 1)]);
          return;
        case 'k':
          moveTo(navigableItems[Math.max(currentIndex - 1, 0)]);
          return;
        default:
          return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [global]);
};
