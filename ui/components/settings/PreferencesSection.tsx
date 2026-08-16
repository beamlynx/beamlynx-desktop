import { Box, Switch, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../store/store-container';

type ToggleRowProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

const ToggleRow = ({ label, description, checked, onChange }: ToggleRowProps) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 2,
      py: 1.25,
      borderBottom: '1px solid var(--border-color)',
    }}
  >
    <Box>
      <Typography variant="body2" sx={{ color: 'var(--text-color)', fontFamily: 'var(--canvas-font)' }}>
        {label}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {description}
      </Typography>
    </Box>
    <Switch checked={checked} onChange={(_e, value) => onChange(value)} />
  </Box>
);

/**
 * Previously these five toggles only existed as command-palette entries
 * (utils/commands.ts) -- no visible switch anywhere, so a user who didn't
 * know Cmd/Ctrl+K existed had no way to find them at all. This is that
 * discoverability fix, not just a relocation.
 */
const PreferencesSection = () => {
  const { global } = useStores();
  const session = global.getSession(global.activeSessionId);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Typography
        variant="h6"
        component="h2"
        sx={{
          flexShrink: 0,
          color: 'var(--text-color)',
          pb: 1.5,
          mb: 2,
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        Preferences
      </Typography>

      <Box className="styled-scrollbar" sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <ToggleRow
          label="Dark theme"
          description="Switch between light and dark appearance."
          checked={global.theme === 'dark'}
          onChange={() => global.toggleTheme()}
        />
        <ToggleRow
          label="Compact mode"
          description="Tighter spacing throughout the app."
          checked={global.forceCompactMode}
          onChange={() => global.toggleCompactMode()}
        />
        <ToggleRow
          label="Table colors"
          description="Color-code result table segments and columns by their source table."
          checked={global.pineTableColorsEnabled}
          onChange={() => global.togglePineTableColors()}
        />
        <ToggleRow
          label="Interactive graph view (experimental)"
          description="Build queries by clicking through tables in a graph instead of writing text."
          checked={global.canvasModeEnabled}
          onChange={() => global.toggleCanvasMode()}
        />
        <ToggleRow
          label="Vim keybindings"
          description="Use vim-style navigation and editing in the query editor."
          checked={session?.vimMode ?? false}
          onChange={() => session?.toggleVimMode()}
        />
      </Box>
    </Box>
  );
};

export default observer(PreferencesSection);
