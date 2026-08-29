import { Box, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../store/store-container';
import ToggleRow from './ToggleRow';

/**
 * Previously these toggles only existed as command-palette entries
 * (utils/commands.ts) -- no visible switch anywhere, so a user who didn't
 * know Cmd/Ctrl+K existed had no way to find them at all. This is that
 * discoverability fix, not just a relocation. Dark theme has since moved to
 * ThemeSection.tsx alongside the rest of the visual/appearance settings.
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
          label="Table colors"
          description="Color-code result table segments and columns by their source table."
          checked={global.pineTableColorsEnabled}
          onChange={() => global.togglePineTableColors()}
        />
        <ToggleRow
          label="Canvas mode"
          description="Build queries by clicking through tables in a graph instead of writing text. Off uses the classic Graph mode."
          checked={global.canvasModeEnabled}
          onChange={() => global.toggleCanvasMode()}
        />
        <ToggleRow
          label="Auto-run on canvas edit"
          description="Automatically run the query each time a canvas gesture commits a valid change."
          checked={global.autoRunEnabled}
          onChange={() => global.toggleAutoRunEnabled()}
        />
        <ToggleRow
          label="New layout"
          description="Canvas-first two-pane layout (Canvas + Results) instead of the classic sidebar arrangement."
          checked={global.layoutMode === 'new'}
          onChange={() => global.toggleLayoutMode()}
        />
        <ToggleRow
          label="Pine panel in New Layout"
          description="Show an editable Pine text panel alongside the canvas, in addition to point-and-click editing."
          checked={global.newLayoutPanelVisible && session.inputMode === 'pine'}
          onChange={() => global.togglePinePanel(session)}
        />
        <ToggleRow
          label="SQL panel in New Layout"
          description="Show an editable SQL text panel alongside the canvas, in addition to point-and-click editing."
          checked={global.newLayoutPanelVisible && session.inputMode === 'sql'}
          onChange={() => global.toggleSqlPanel(session)}
        />
        <ToggleRow
          label="Vim keybindings"
          description="Use vim-style navigation and editing in the query editor and single-letter shortcuts (j/k, s/w/o/g, u/U, ...) on the canvas."
          checked={session?.vimMode ?? false}
          onChange={() => session?.toggleVimMode()}
        />
      </Box>
    </Box>
  );
};

export default observer(PreferencesSection);
