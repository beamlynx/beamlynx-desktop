import { Box, Button, Typography } from '@mui/material';
import { LinkOutlined } from '@mui/icons-material';
import { runInAction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { Session as SessionType } from '../store/session';
import { useStores } from '../store/store-container';

/**
 * Shown at the top of a tab a beamlynx://run link opened (see
 * DeepLinkHandler.tsx and Session.openedFromLink). The link's expression is
 * in the editor but has not run: anyone can write such a link. This names
 * the connection it would run on, so the person can check both before
 * pressing Run. Goes away on Dismiss or after the first run that succeeds.
 */
const LinkOpenedBanner = observer(({ session }: { session: SessionType }) => {
  const { global } = useStores();
  if (!session.openedFromLink) return null;

  const connectionLabel = session.connectionId
    ? global.getConnectionLabel(session.connectionId)
    : 'no connection';

  return (
    <Box
      sx={{
        px: 2,
        py: 0.75,
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--canvas-chip-bg)',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
      }}
    >
      <LinkOutlined sx={{ fontSize: 16, flexShrink: 0, color: 'var(--notification-color)' }} />
      <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
        Opened from a link. It has not run. Check the expression and the connection (
        <Box component="span" sx={{ fontWeight: 600 }}>
          {connectionLabel}
        </Box>
        ), then press Run.
      </Typography>
      <Button
        size="small"
        onClick={() =>
          runInAction(() => {
            session.openedFromLink = false;
          })
        }
      >
        Dismiss
      </Button>
    </Box>
  );
});

export default LinkOpenedBanner;
