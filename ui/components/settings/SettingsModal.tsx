import { Modal, Paper, Box, Typography, IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../store/store-container';
import { isDesktop } from '../../store/util';
import { SettingsSection } from '../../store/global.store';
import ConnectionsSection from './ConnectionsSection';
import PreferencesSection from './PreferencesSection';
import McpSection from './McpSection';
import AboutSection from './AboutSection';

const RAIL_ITEMS: { id: SettingsSection; label: string }[] = [
  // "Database" is deliberate, not filler -- a future "connection to the pine
  // server itself" concept will also use the word "connection", so this
  // stays unambiguous about which kind it means from the rail alone.
  { id: 'connections', label: 'Database Connections' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'mcp', label: 'MCP' },
  { id: 'about', label: 'About' },
];

/**
 * Consolidated settings surface -- previously connection management, MCP
 * setup, and app preferences (theme/vim/compact/table-colors/canvas mode)
 * were scattered across ActiveConnection.tsx's dropdown, the command
 * palette (the only access point for the preference toggles -- no visible
 * switch existed anywhere), and a separate MCP instructions modal. Opened
 * via the header's settings icon (see AppView.tsx) or the "Manage
 * connections…" link in ActiveConnection.tsx's quick switcher.
 *
 * The MCP rail item is always shown, even on web/playground builds, rather
 * than hidden -- so the feature is discoverable as "available in the
 * desktop app" instead of silently not existing. See McpSection.tsx for
 * what renders in each case.
 */
const SettingsModal = () => {
  const { global } = useStores();
  const activeSection = global.settingsSection;

  const handleClose = () => global.setShowSettings(false);

  return (
    <Modal open={global.showSettings} onClose={handleClose}>
      <Paper
        elevation={3}
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 750,
          maxWidth: '92vw',
          // Fixed, not just capped -- letting each section's natural content
          // height drive the modal's height made it visibly resize every
          // time you switched rail items. A shared default keeps switching
          // stable; overflowY below still covers any section taller than this.
          height: 480,
          maxHeight: '85vh',
          bgcolor: 'var(--background-color)',
          // MUI's Paper applies a dark-mode "elevation overlay" (a
          // semi-transparent white gradient) by default -- the same fix
          // ActiveConnection.tsx already needed for its dropdown menu. Left
          // on, it renders the Paper visibly lighter than the flat
          // var(--background-color) each section's sticky header uses,
          // producing a mismatched tinted band right under every title.
          backgroundImage: 'none',
          border: '1px solid var(--border-color)',
          borderRadius: 2,
          outline: 'none',
          display: 'flex',
          overflow: 'hidden',
        }}
      >
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
                  fontSize: '0.85rem',
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
                  <Typography variant="caption" component="span" sx={{ opacity: 0.7, fontSize: '0.65rem' }}>
                    desktop
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>

        {/* Each section owns its own fixed-header/scrollable-body split
            (see e.g. PreferencesSection.tsx) rather than this pane scrolling
            as a whole -- position: sticky here previously, but combined with
            this Paper's centering transform + overflow: hidden, Chromium
            would occasionally paint a "stuck" section title outside the
            Paper's clip region while scrolling. Plain flex layout has no
            such quirk. */}
        <Box sx={{ flex: 1, minHeight: 0, p: 3, display: 'flex', flexDirection: 'column' }}>
          {activeSection === 'connections' && <ConnectionsSection />}
          {activeSection === 'preferences' && <PreferencesSection />}
          {activeSection === 'mcp' && <McpSection />}
          {activeSection === 'about' && <AboutSection />}
        </Box>
      </Paper>
    </Modal>
  );
};

export default observer(SettingsModal);
