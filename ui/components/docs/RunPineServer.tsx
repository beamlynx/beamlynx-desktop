import { useState } from 'react';
import { RequiredVersion } from '../../constants';
import { Box, Typography, Button, Link, Paper, Grid } from '@mui/material';
import { GitHub, Book, RssFeed } from '@mui/icons-material';

export const RunPineServer = () => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(
      `docker run -p 33333:33333 --add-host host.docker.internal:host-gateway ahmadnazir/pine:${RequiredVersion}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box sx={{ p: 4, maxWidth: '800px', mx: 'auto', textAlign: 'left' }}>
      <Typography
        variant="h3"
        component="h1"
        gutterBottom
        sx={{ fontWeight: 'bold', color: 'primary.main', textAlign: 'center', mb: 6 }}
      >
        Hey there ... 👋
      </Typography>

      <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
        I&apos;m building Pine on a simple belief: working with databases can be more intuitive — maybe
        even enjoyable.
      </Typography>

      <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
        It&apos;s still early days, and your honest feedback is vital. I&apos;d love to hear what you think.
      </Typography>

      <Paper
        elevation={3}
        sx={{ p: 3, mb: 6, textAlign: 'left', backgroundColor: 'background.paper' }}
      >
        <Typography variant="h6" gutterBottom>
          First things first...
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          To get started, run the Pine server. The easiest way is with the Docker command below:
        </Typography>
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

      <Grid container spacing={3} justifyContent="center">
        <Grid item>
          <Link
            href="https://pine-lang.org/"
            target="_blank"
            underline="hover"
            color="inherit"
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <Book />
            <Typography>Website</Typography>
          </Link>
        </Grid>
        <Grid item>
          <Link
            href="https://github.com/pine-lang"
            target="_blank"
            underline="hover"
            color="inherit"
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <GitHub />
            <Typography>GitHub</Typography>
          </Link>
        </Grid>
        <Grid item>
          <Link
            href="https://pinelang.substack.com/"
            target="_blank"
            underline="hover"
            color="inherit"
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <RssFeed />
            <Typography>Substack</Typography>
          </Link>
        </Grid>
      </Grid>
    </Box>
  );
};
