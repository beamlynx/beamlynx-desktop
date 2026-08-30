import { useMemo } from 'react';
import { Box, Typography, IconButton, ThemeProvider } from '@mui/material';
import { Close } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../store/store-container';
import { isDesktop } from '../../store/util';
import { SettingsSection } from '../../store/global.store';
import { createSettingsTheme } from '../../styles/theme';
import { TEXT_SIZE_SCALE } from '../../styles/text-size';
import ConnectionsSection from './ConnectionsSection';
import ThemeSection from './ThemeSection';
import PreferencesSection from './PreferencesSection';
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
  { id: 'mcp', label: 'MCP' },
  { id: 'about', label: 'About' },
];

/**
 * Rail nav + section content, shared by both Settings shells: the floating
 * Modal (SettingsModal.tsx, Legacy Layout) and the docked panel
 * (SettingsDockedPanel.tsx, New Layout). Neither shell contributes anything
 * but its own outer positioning/chrome -- this is the entire "what Settings
 * actually shows" surface, so the two never drift out of sync with each
 * other. Fills whatever box its shell gives it (`height: 100%`).
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
            -- SavePineModal.tsx already established this exact affordance
            (top-right IconButton + Close icon) for the app's other modals,
            so this matches rather than invents a new convention. */}
        <IconButton
          onClick={handleClose}
          size="small"
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

        <Box
          sx={{
            width: 210,
            flexShrink: 0,
            borderRight: '1px solid var(--border-color)',
            bgcolor: 'var(--node-column-bg)',
            py: 2,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              px: 2,
              mb: 1,
              color: 'var(--canvas-text-dim)',
              fontFamily: 'var(--canvas-font)',
              letterSpacing: '0.05em',
            }}
          >
            SETTINGS
          </Typography>
          {RAIL_ITEMS.map(item => {
            const disabled = item.id === 'mcp' && !isDesktop();
            const active = item.id === activeSection;
            return (
              <Box
                key={item.id}
                onClick={() => global.setSettingsSection(item.id)}
                sx={{
                  px: 2,
                  py: 1,
                  cursor: 'pointer',
                  fontFamily: 'var(--canvas-font)',
                  // Fixed px, not rem -- see settingsTheme's comment above.
                  fontSize: '13.6px',
                  color: active ? 'var(--text-color)' : 'var(--canvas-text-dim)',
                  opacity: disabled ? 0.55 : 1,
                  borderLeft: active ? '2px solid var(--primary-color)' : '2px solid transparent',
                  backgroundColor: active ? 'var(--background-color)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  '&:hover': { color: 'var(--text-color)' },
                }}
              >
                {item.label}
                {disabled && (
                  <Typography
                    variant="caption"
                    component="span"
                    sx={{ opacity: 0.7, fontSize: '10.4px' }}
                  >
                    desktop
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>

        {/* Each section owns its own fixed-header/scrollable-body split
            (see e.g. PreferencesSection.tsx) rather than this pane scrolling
            as a whole -- position: sticky here previously (in the Modal
            shell), but combined with that Paper's centering transform +
            overflow: hidden, Chromium would occasionally paint a "stuck"
            section title outside the Paper's clip region while scrolling.
            Plain flex layout has no such quirk. */}
        <Box sx={{ flex: 1, minHeight: 0, p: 3, display: 'flex', flexDirection: 'column' }}>
          {activeSection === 'connections' && <ConnectionsSection />}
          {activeSection === 'theme' && <ThemeSection />}
          {activeSection === 'preferences' && <PreferencesSection />}
          {activeSection === 'mcp' && <McpSection />}
          {activeSection === 'about' && <AboutSection />}
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default observer(SettingsPanelContent);
