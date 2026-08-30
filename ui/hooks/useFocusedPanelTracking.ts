import { useEffect } from 'react';
import { GlobalStore } from '../store/global.store';

interface FocusedPanelTrackingProps {
  global: GlobalStore;
}

/**
 * Tracks which panel (New Layout's Canvas, docked Settings, or the Pine/SQL
 * Input panel) currently holds real DOM focus, writing it to
 * GlobalStore.focusedPanelId. This is the single signal panel-scoped
 * keybinding hooks (useCanvasKeybindings, useSettingsKeybindings) gate on --
 * see GlobalStore.activeKeyboardPanel's own comment for why DOM focus, not
 * panel visibility, is the source of truth.
 *
 * A single document-level `focusin`/`focusout` pair (mirroring
 * useGlobalKeybindings.ts's single-listener style) rather than a listener per
 * panel -- `focusin` bubbles, so one handler walking up to the nearest
 * `[data-keyboard-panel]` ancestor covers every panel root the same way,
 * regardless of which specific focusable element (a CodeMirror editor, an
 * MUI TextField, a panel root focused via its own onMouseDownCapture) is the
 * actual target.
 */
export const useFocusedPanelTracking = ({ global }: FocusedPanelTrackingProps) => {
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const panelRoot = target?.closest('[data-keyboard-panel]');
      const panelId = panelRoot?.getAttribute('data-keyboard-panel') as
        | 'graph'
        | 'settings'
        | 'input'
        | null;
      global.setFocusedPanelId(panelId ?? null);
    };

    // Only clear when focus leaves every panel root outright (e.g. blurring
    // to the header/tab strip, or losing focus to the window itself) --
    // moving focus between two elements inside the SAME panel root fires a
    // focusout immediately followed by a focusin for that same panel, so
    // clearing unconditionally here would just cause a one-tick flicker back
    // to the 'graph' fallback on every such move.
    const handleFocusOut = (e: FocusEvent) => {
      const related = e.relatedTarget instanceof Element ? e.relatedTarget : null;
      if (related?.closest('[data-keyboard-panel]')) return;
      global.setFocusedPanelId(null);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [global]);
};
