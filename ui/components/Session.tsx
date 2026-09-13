import { Box } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import NewLayoutView from './NewLayoutView';
import RevealRequestBanner from './RevealRequestBanner';

interface SessionProps {
  sessionId: string;
}

const Session: React.FC<SessionProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 }}>
      {session.pendingRevealRequestId && <RevealRequestBanner session={session} />}
      {/* Same flex-column/flex:1/minHeight:0 combination PineTabs' TabPanel
          already gives this component directly -- kept identical here so
          NewLayoutView (which already relies on that exact parent shape for
          its own internal sizing) renders under an equivalent box, with the
          banner above just taking its own space out of the column first.
          flexDirection must stay 'column': a bare display:'flex' defaults to
          row, which would hand NewLayoutView a horizontal main axis instead
          of the vertical one it's built for. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 }}>
        <NewLayoutView sessionId={sessionId} />
      </Box>
    </Box>
  );
});

export default Session;
