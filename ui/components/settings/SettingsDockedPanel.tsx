import { Box } from '@mui/material';
import SettingsPanelContent from './SettingsPanelContent';

/**
 * New Layout's Settings shell -- a plain docked panel, not a Modal. New
 * Layout can show Canvas and Results side by side, and a floating overlay
 * (any position -- centered, or anchored to a side) either covers the
 * canvas outright or is a guess about where it happens to be. Docking
 * instead shrinks the layout to make room for itself (see NewLayoutView.tsx,
 * which renders this as a flex sibling of the Canvas|Results split, sized
 * by its own resizable divider) -- nothing is ever covered, so there's
 * nothing to judge a change against that Settings itself is hiding.
 *
 * No backdrop/scrim, unlike SettingsModal.tsx (Legacy's floating shell) --
 * the whole point of docking is that nothing needs dimming. Also, no
 * Escape-to-close -- that made sense for the old floating Modal (Escape is
 * Modal's own built-in dismiss), but a docked panel isn't in anyone's way,
 * and stealing Escape here would fight whatever else on screen wants it
 * (closing a picker, say) while Settings sits open in the background.
 * Closed only by its own IconButton (SettingsPanelContent) or the gear icon.
 */
const SettingsDockedPanel = () => {
  return (
    <Box
      data-keyboard-panel="settings"
      // -1, not a real Tab stop: closing Settings (its own IconButton, or
      // the gear icon) is the way back to the Canvas panel -- Tab was tried
      // as a second way to cross panels and reverted (broke the focus ring
      // and wasn't the flow that was wanted), so this root is reachable only
      // by clicking, same as Canvas/Input's own roots in NewLayoutView.tsx.
      tabIndex={-1}
      onMouseDownCapture={e => {
        // Only steal focus onto the panel root when the click target won't
        // already take it natively -- otherwise this would fight the
        // browser's own click-to-focus behavior for e.g. a connection name
        // TextField inside a section (see useFocusedPanelTracking.ts's doc
        // comment for why that's fine either way: focusin bubbles up to this
        // same [data-keyboard-panel] root regardless of which descendant
        // actually ends up focused).
        const target = e.target as HTMLElement;
        if (!target.closest('input, textarea, button, [tabindex], [contenteditable="true"]')) {
          e.currentTarget.focus();
        }
      }}
      sx={{
        height: '100%',
        bgcolor: 'var(--background-color)',
        overflow: 'hidden',
        outline: 'none',
      }}
    >
      <SettingsPanelContent />
    </Box>
  );
};

export default SettingsDockedPanel;
