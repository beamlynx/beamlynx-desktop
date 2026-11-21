import { useState } from 'react';
import { RequiredVersion } from '../../constants';
import { Box, Typography, Button, Paper, SxProps, Theme } from '@mui/material';

interface DockerCommandProps {
  title?: string;
  description?: string;
  sx?: SxProps<Theme>;
}

export const DockerCommand = ({ title, description, sx }: DockerCommandProps) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(
      `docker run -p 33333:33333 --add-host host.docker.internal:host-gateway ahmadnazir/pine:${RequiredVersion}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Paper elevation={3} sx={{ p: 3, textAlign: 'left', backgroundColor: 'background.paper', ...sx }}>
      {title && (
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
      )}
      {description && (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {description}
        </Typography>
      )}
      <Box
        sx={{
          p: 2,
          backgroundColor: 'grey.900',
          borderRadius: 1,
          fontFamily: 'monospace',
          color: '#f8f8f2',
          position: 'relative',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
        }}
      >
        <code>
          docker run \<br />
          &nbsp;&nbsp;&nbsp;&nbsp;-p 33333:33333 \<br />
          &nbsp;&nbsp;&nbsp;&nbsp;--add-host host.docker.internal:host-gateway \<br />
          &nbsp;&nbsp;&nbsp;&nbsp;ahmadnazir/pine:{RequiredVersion}
        </code>
        <Button
          variant="contained"
          size="small"
          onClick={copyToClipboard}
          sx={{ position: 'absolute', top: 8, right: 8 }}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </Button>
      </Box>
    </Paper>
  );
}; 