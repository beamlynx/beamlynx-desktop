import { useState, type ReactNode } from 'react';
import { observer } from 'mobx-react-lite';
import { Box, ButtonBase, CircularProgress, Typography } from '@mui/material';
import StorefrontOutlined from '@mui/icons-material/StorefrontOutlined';
import StorageOutlined from '@mui/icons-material/StorageOutlined';
import { useStores } from '../store/store-container';
import { isDesktop } from '../store/util';

/**
 * What a tab shows while there are no saved connections: the two ways to
 * start. One click opens the sample database (a small shop the desktop app
 * builds), or the form to connect your own. Shown instead of an empty canvas,
 * whose "pick a table" can't work without a database.
 *
 * The web build can't open SQLite files, so it offers only the form.
 */
const GetStarted = observer(() => {
  const { global } = useStores();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const canUseSample = isDesktop() && !!window.beamlynxDesktop?.credentials.prepareSampleDatabase;
  // Pine takes a few seconds to start on a first launch. Until it answers,
  // nothing can connect.
  const ready = global.pineConnected;

  const openSample = async () => {
    if (opening || !ready) return;
    setOpening(true);
    setError('');
    try {
      await global.connectSampleDatabase();
    } catch (e) {
      setError((e as Error)?.message ?? 'The sample database could not be opened.');
      setOpening(false);
    }
  };

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        p: 3,
        overflowY: 'auto',
      }}
    >
      <Typography
        component="h1"
        sx={{
          color: 'var(--text-color)',
          fontSize: 'calc(20px * var(--text-scale, 1))',
          fontWeight: 500,
        }}
      >
        Pick a database to start
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: canUseSample
            ? 'repeat(auto-fit, minmax(240px, 1fr))'
            : 'minmax(240px, 1fr)',
          gap: 2,
          width: canUseSample ? 560 : 280,
          maxWidth: '100%',
        }}
      >
        {canUseSample && (
          <Choice
            icon={<StorefrontOutlined />}
            title="Try the sample shop"
            text="Customers, orders and products, ready to query. Nothing to set up."
            onClick={openSample}
            disabled={!ready || opening}
            busy={opening}
            primary
          />
        )}
        <Choice
          icon={<StorageOutlined />}
          title="Connect your database"
          text={canUseSample ? 'PostgreSQL, MySQL or a SQLite file.' : 'PostgreSQL or MySQL.'}
          onClick={() => global.openAddConnection()}
          disabled={opening}
        />
      </Box>

      <Typography
        variant="caption"
        role="status"
        sx={{
          minHeight: '1.5em',
          color: error ? 'var(--text-warning-color)' : 'var(--text-color)',
          opacity: error ? 1 : 0.6,
          textAlign: 'center',
          maxWidth: 560,
        }}
      >
        {error || (!ready ? 'Starting Beamlynx…' : opening ? 'Opening the sample shop…' : '')}
      </Typography>
    </Box>
  );
});

const Choice = ({
  icon,
  title,
  text,
  onClick,
  disabled,
  busy = false,
  primary = false,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  onClick: () => void;
  disabled: boolean;
  busy?: boolean;
  primary?: boolean;
}) => (
  <ButtonBase
    onClick={onClick}
    disabled={disabled}
    focusRipple
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      textAlign: 'left',
      gap: 1,
      p: 2.5,
      borderRadius: 1.5,
      border: '1px solid',
      borderColor: primary ? 'var(--primary-color)' : 'var(--border-color)',
      bgcolor: 'var(--node-column-bg)',
      color: 'var(--text-color)',
      transition:
        'border-color var(--motion-fast, 120ms), background-color var(--motion-fast, 120ms)',
      '&:hover': { borderColor: 'var(--primary-color)', bgcolor: 'var(--background-color)' },
      '&.Mui-focusVisible': { outline: '2px solid var(--primary-color)', outlineOffset: 2 },
      '&.Mui-disabled': { opacity: busy ? 1 : 0.55 },
    }}
  >
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        color: primary ? 'var(--primary-color)' : 'var(--icon-color)',
      }}
    >
      {busy ? <CircularProgress size={20} sx={{ color: 'var(--primary-color)' }} /> : icon}
      <Typography
        sx={{
          fontWeight: 600,
          color: 'var(--text-color)',
          fontSize: 'calc(14px * var(--text-scale, 1))',
        }}
      >
        {title}
      </Typography>
    </Box>
    <Typography variant="body2" sx={{ color: 'var(--text-color)', opacity: 0.7 }}>
      {text}
    </Typography>
  </ButtonBase>
);

export default GetStarted;
