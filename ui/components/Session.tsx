import { Box } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useCollapseHeight } from '../hooks/useCollapseHeight';
import { useStores } from '../store/store-container';
import NewLayoutView from './NewLayoutView';
import RevealRequestBanner from './RevealRequestBanner';

interface SessionProps {
  sessionId: string;
}

const Session: React.FC<SessionProps> = observer(({ sessionId }) => {
  const { global } = useStores();
  const session = global.getSession(sessionId);
  // Measured rather than fixed - the banner's height depends on the agent's
  // own reason text, the connection name, and whether the decline comment
  // field is open. See hooks/useCollapseHeight.ts.
  const banner = useCollapseHeight<HTMLDivElement>(Boolean(session.pendingRevealRequestId));
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 }}>
      {/* Slides down into place rather than appearing. This is the one
          surface in the app the USER didn't ask for - an agent raised it,
          possibly while they were looking at something else entirely - so
          it's worth spending a moment of motion saying "this just
          arrived" rather than having it be there as though it always had
          been. The translate is what carries that; height alone would
          just be the layout reflowing. */}
      <Box
        data-panel-motion
        sx={{
          flexShrink: 0,
          overflow: 'hidden',
          height: banner.height,
          transition: 'height var(--motion-enter) var(--motion-ease-enter)',
        }}
      >
        <Box
          ref={banner.contentRef}
          sx={{
            opacity: session.pendingRevealRequestId ? 1 : 0,
            transform: session.pendingRevealRequestId ? 'translateY(0)' : 'translateY(-100%)',
            transition:
              'opacity var(--motion-enter) var(--motion-ease-enter), transform var(--motion-enter) var(--motion-ease-enter)',
          }}
        >
          <RevealRequestBanner session={session} />
        </Box>
      </Box>
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
