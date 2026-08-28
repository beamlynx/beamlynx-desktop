import { Modal, Paper } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../store/store-container';
import SettingsPanelContent from './SettingsPanelContent';

/**
 * Legacy Layout's Settings shell -- a floating Modal. New Layout instead
 * docks the same SettingsPanelContent (see SettingsDockedPanel.tsx and
 * AppView.tsx's layoutMode branch), since it can show Canvas and Results
 * side by side and a floating modal there ends up covering whichever one
 * you're actually trying to judge a change against. Legacy never shows both
 * at once (Session.tsx's MainView mode-switches between them), so that
 * problem doesn't apply here -- kept as the simpler floating modal rather
 * than reworking Legacy's Grid/calc()-based width math for its own dock.
 */
const SettingsModal = () => {
  const { global } = useStores();
  const handleClose = () => global.setShowSettings(false);

  return (
    <Modal
      open={global.showSettings}
      onClose={handleClose}
      slotProps={{
        // Default MUI scrim (rgba(0,0,0,0.5)) made it impossible to judge a
        // theme/font change against the app behind it -- CommandPalette.tsx
        // already established lightening this for the same reason. Kept
        // faintly visible (unlike CommandPalette's fully transparent 0)
        // since this modal is large enough to need some separation from the
        // content behind it.
        backdrop: { sx: { backgroundColor: 'rgba(0, 0, 0, 0.15)' } },
      }}
    >
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
        }}
      >
        <SettingsPanelContent />
      </Paper>
    </Modal>
  );
};

export default observer(SettingsModal);
