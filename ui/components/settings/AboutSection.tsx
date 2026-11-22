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
          A visual database client that knows your schema, built for working safely with AI agents.
        </Typography>

        <InfoRow label="Website">
          <Link href="https://beamlynx.com" target="_blank" rel="noopener noreferrer" underline="hover">
            beamlynx.com
          </Link>
        </InfoRow>

        <InfoRow label="License">
          Open source under the{' '}
          <Link
            href="https://github.com/beamlynx/beamlynx-desktop/blob/main/LICENSING.md"
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
          >
            GNU AGPL-3.0
          </Link>
          . For a commercial license, write to{' '}
          <Link href="mailto:contact@grephyte.com" underline="hover">
            contact@grephyte.com
          </Link>
          .
        </InfoRow>

        <InfoRow label="Source code">
          <Link
            href="https://github.com/beamlynx/beamlynx-desktop"
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
          >
            github.com/beamlynx/beamlynx-desktop
          </Link>
        </InfoRow>

        <InfoRow label="Privacy">
          <Link href="https://beamlynx.com/privacy" target="_blank" rel="noopener noreferrer" underline="hover">
            What the app sends, and what it never does
          </Link>
        </InfoRow>

        {isDesktop() && appVersion && <InfoRow label="App version">{appVersion}</InfoRow>}
        {global.version && <InfoRow label="Server version">{global.version}</InfoRow>}
      </Box>
    </Box>
  );
};

export default observer(AboutSection);
