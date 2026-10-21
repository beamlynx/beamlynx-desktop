import { useMemo } from 'react';
import { Box, IconButton, ThemeProvider } from '@mui/material';
import { Close } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../store/store-container';
import { SettingsSection } from '../../store/global.store';
import { createSettingsTheme } from '../../styles/theme';
import { TEXT_SIZE_SCALE } from '../../styles/text-size';
import ConnectionsSection from './ConnectionsSection';
import ThemeSection from './ThemeSection';
import PreferencesSection from './PreferencesSection';
import AccessPolicySection from './AccessPolicySection';
import McpSection from './McpSection';
import AboutSection from './AboutSection';

// Exported so useSettingsKeybindings.ts can drive j/k rail navigation off
// the exact same order shown here, rather than a second, hand-kept list.
export const RAIL_ITEMS: { id: SettingsSection; label: string }[] = [
  // "Database" is deliberate, not filler -- a future "connection to the pine
  // server itself" concept will also use the word "connection", so this
  // stays unambiguous about which kind it means from the rail alone.
  { id: 'connections', label: 'Database Connections' },
  { id: 'theme', label: 'Appearance' },
  { id: 'preferences', label: 'Preferences' },
  // Just before 'mcp' -- it's a prerequisite for MCP access (see
  // AccessPolicySection.tsx), not an unrelated setting placed nearby.
  { id: 'access-policy', label: 'Policy templates' },
  { id: 'mcp', label: 'MCP' },
  { id: 'about', label: 'About' },
];

// 'access-policy' is desktop-only for the same reason 'mcp' is: it exists
// entirely to govern MCP access, which doesn't exist in browser mode.
// Exported for the same reason RAIL_ITEMS is -- useSettingsKeybindings.ts's
// j/k rail navigation skips these in browser mode too, off this exact list,
// not a second hand-kept one.
export const DESKTOP_ONLY_SECTIONS: SettingsSection[] = ['access-policy', 'mcp'];

/**
 * The open section's content -- the entire "what Settings actually shows"
 * surface. The sections (RAIL_ITEMS) are items in the sidebar
 * (SideRail.tsx), so there is one column of navigation, not two side by
 * side. Its shell (SettingsDockedPanel.tsx) contributes nothing
 * but its own outer positioning/chrome. Fills whatever box its shell gives
 * it (`height: 100%`).
 */
const SettingsPanelContent = () => {
  const { global } = useStores();
  const activeSection = global.settingsSection;

  const handleClose = () => global.setShowSettings(false);

  // Frozen regardless of global.textSize on purpose -- this panel's own
  // typography/spacing otherwise reflows with the same app-wide scale its
  // Text Size control changes, which meant adjusting Text Size *while
  // looking at the control that adjusts it* shifted every row above it
  // (Theme, Interface font, Code font), visibly moving the Text Size row
  // itself out from under the cursor -- reported live as "it scrolls away
  // and I have to scroll back". This was never a faithful live preview
  // anyway (MUI's Typography variants here don't match the query editor/
  // results grid text the setting actually governs), so trading it away
  // for a settings surface that holds still while you use it is a clear
  // win, not a compromise. Colors still track the live theme; see
  // createSettingsTheme's own comment for why the current scale (not a
  // constant) is what has to be passed in to actually cancel it out.
  const settingsTheme = useMemo(
    () => createSettingsTheme(global.themeId, TEXT_SIZE_SCALE[global.textSize]),
    [global.themeId, global.textSize],
  );

  return (
    <ThemeProvider theme={settingsTheme}>
      <Box sx={{ position: 'relative', height: '100%', display: 'flex', overflow: 'hidden' }}>
        {/* Modal's backdrop-click/Escape close isn't discoverable on its own
            -- the app's other modals already established this exact affordance
            (top-right IconButton + Close icon) for the app's other modals,
            so this matches rather than invents a new convention. tabIndex={-1}
            (mouse-only, like Input.tsx's PINE/SQL toggle) -- it's the first
            element in this component's own DOM order, so without this Tab
            landed here before ever reaching anything in the section below
            (e.g. the connections list) -- confirmed live. Closing already
            has its own keyboard path (the gear icon's own Ctrl/Cmd+,), so
            losing this from the Tab sequence doesn't remove a capability. */}
        <IconButton
          onClick={handleClose}
          size="small"
          tabIndex={-1}
          aria-label="Close settings"
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 1,
            color: 'var(--text-color)',
            '&:hover': { backgroundColor: 'var(--hover-color)' },
          }}
        >
          <Close fontSize="small" />
        </IconButton>

        {/* Each section owns its own fixed-header/scrollable-body split
            (see e.g. PreferencesSection.tsx) rather than this pane scrolling
            as a whole -- position: sticky here previously (in the Modal
            shell), but combined with that Paper's centering transform +
            overflow: hidden, Chromium would occasionally paint a "stuck"
            section title outside the Paper's clip region while scrolling.
            Plain flex layout has no such quirk. */}
        <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, p: 3, display: 'flex', flexDirection: 'column' }}>
          {activeSection === 'connections' && <ConnectionsSection />}
          {activeSection === 'theme' && <ThemeSection />}
          {activeSection === 'preferences' && <PreferencesSection />}
          {activeSection === 'access-policy' && <AccessPolicySection />}
          {activeSection === 'mcp' && <McpSection />}
          {activeSection === 'about' && <AboutSection />}
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default observer(SettingsPanelContent);
