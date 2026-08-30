import { useEffect } from 'react';
import { GlobalStore } from '../store/global.store';
import { isDesktop } from '../store/util';
import { RAIL_ITEMS } from '../components/settings/SettingsPanelContent';

interface SettingsKeybindingsProps {
  global: GlobalStore;
}

/**
 * Vim-style j/k (and Arrow Up/Down) navigation over the Settings rail --
 * mirrors useCanvasKeybindings.ts's structure (single document-level keydown
 * listener, gated on which panel currently owns bare-key input) but is its
 * own hook rather than an addition to that one, same reasoning as that file's
 * own doc comment: these are single bare letters, which only make sense to
 * interpret while GlobalStore.activeKeyboardPanel === 'settings'.
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
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;

      const navigableItems = RAIL_ITEMS.filter(item => item.id !== 'mcp' || isDesktop());
      const currentIndex = navigableItems.findIndex(item => item.id === global.settingsSection);

      switch (e.key) {
        case 'ArrowDown':
        case 'j': {
          e.preventDefault();
          const next = navigableItems[Math.min(currentIndex + 1, navigableItems.length - 1)];
          if (next) global.setSettingsSection(next.id);
          return;
        }
        case 'ArrowUp':
        case 'k': {
          e.preventDefault();
          const prev = navigableItems[Math.max(currentIndex - 1, 0)];
          if (prev) global.setSettingsSection(prev.id);
          return;
        }
        default:
          return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [global]);
};
