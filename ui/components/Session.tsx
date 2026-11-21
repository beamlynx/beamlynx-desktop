import { Box } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import NewLayoutView from './NewLayoutView';
import LinkOpenedBanner from './LinkOpenedBanner';
import SaveRecipeBar from './recipes/SaveRecipeBar';
import InvestigationPanel from './InvestigationPanel';

interface SessionProps {
  sessionId: string;
}

const Session: React.FC<SessionProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
  const investigation = global.investigationForSession(sessionId);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 }}>
      {/* A beamlynx://run link put an expression here without running it. */}
      <LinkOpenedBanner session={session} />
      {/* Same flex-column/flex:1/minHeight:0 combination PineTabs' TabPanel
          already gives this component directly -- kept identical here so
          NewLayoutView (which already relies on that exact parent shape for
          its own internal sizing) renders under an equivalent box, with the
          banner above just taking its own space out of the column first.
          flexDirection must stay 'column': a bare display:'flex' defaults to
          row, which would hand NewLayoutView a horizontal main axis instead
          of the vertical one it's built for. */}
      {/* Ctrl+S: the title bar for saving the query as a recipe. Above the
          tab rather than in a dialog, so the query stays in view while it's
          named. Only on the active tab. */}
      {global.showSaveRecipe && sessionId === global.activeSessionId && <SaveRecipeBar session={session} />}
      {/* An agent's investigation: its timeline beside the canvas and the
          results (store/investigations.ts). */}
      <Box sx={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, minWidth: 0 }}>
        {investigation && <InvestigationPanel investigation={investigation} />}
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 }}>
          <NewLayoutView sessionId={sessionId} />
        </Box>
      </Box>
    </Box>
  );
});

export default Session;
