import { useEffect, useState } from 'react';
import { Box, Link, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../store/store-container';
import { isDesktop } from '../../store/util';

type InfoRowProps = {
  label: string;
  children: React.ReactNode;
};

const InfoRow = ({ label, children }: InfoRowProps) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 2,
      py: 1.25,
      borderBottom: '1px solid var(--border-color)',
    }}
  >
    <Typography
      variant="caption"
      sx={{ width: 90, flexShrink: 0, color: 'var(--canvas-text-dim)', fontFamily: 'var(--canvas-font)' }}
    >
      {label}
    </Typography>
    <Typography variant="body2" sx={{ color: 'var(--text-color)' }}>
      {children}
    </Typography>
  </Box>
);

const AboutSection = () => {
  const { global } = useStores();
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return;
    window.beamlynxDesktop.getAppVersion().then(setAppVersion);
  }, []);

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
        About
      </Typography>

      <Box className="styled-scrollbar" sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Beamlynx is a visual database client.
        </Typography>

        <InfoRow label="Website">
          <Link href="https://beamlynx.com" target="_blank" rel="noopener noreferrer" underline="hover">
            beamlynx.com
          </Link>
        </InfoRow>

        <InfoRow label="License">
          Free to install and use for noncommercial purposes under the{' '}
          <Link
            href="https://polyformproject.org/licenses/noncommercial/1.0.0"
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
          >
            PolyForm Noncommercial License 1.0.0
          </Link>
          . Commercial use isn&apos;t licensed under these terms --{' '}
          <Link href="mailto:contact@grephyte.com" underline="hover">
            contact@grephyte.com
          </Link>{' '}
          to discuss a commercial license.
        </InfoRow>

        {isDesktop() && appVersion && <InfoRow label="App version">{appVersion}</InfoRow>}
        {process.env.NEXT_PUBLIC_APP_VERSION && (
          <InfoRow label="UI version">{process.env.NEXT_PUBLIC_APP_VERSION}</InfoRow>
        )}
        {global.version && <InfoRow label="Server version">{global.version}</InfoRow>}
      </Box>
    </Box>
  );
};

export default observer(AboutSection);
