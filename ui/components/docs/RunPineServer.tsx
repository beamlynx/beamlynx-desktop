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
    <Box sx={{ p: 4, maxWidth: '800px', mx: 'auto', textAlign: 'center' }}>
      <Typography variant="h3" component="h1" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
        Hey! 👋
      </Typography>
      <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
        We&apos;re building Pine to be the most intuitive, insightful, and delightful way to work with databases.
      </Typography>

      <Paper elevation={3} sx={{ p: 3, mb: 4, textAlign: 'left', backgroundColor: 'background.paper' }}>
        <Typography variant="h6" gutterBottom>
          First things first...
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          To get started, you&apos;ll need to run the Pine server. The easiest way is with the Docker command below.
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
            docker run -p 33333:33333 --add-host host.docker.internal:host-gateway ahmadnazir/pine:{RequiredVersion}
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
      
      <Grid container spacing={4} justifyContent="center" sx={{ mt: 2 }}>
        <Grid item>
          <Link href="https://pine-lang.org/" target="_blank" underline="hover" color="inherit" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Book />
            <Typography>Website</Typography>
          </Link>
        </Grid>
        <Grid item>
          <Link href="https://github.com/pine-lang" target="_blank" underline="hover" color="inherit" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GitHub />
            <Typography>GitHub</Typography>
          </Link>
        </Grid>
        <Grid item>
           <Link href="https://pinelang.substack.com/" target="_blank" underline="hover" color="inherit" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RssFeed />
            <Typography>Substack</Typography>
          </Link>
        </Grid>
      </Grid>
      
      <Box sx={{ mt: 4 }}>
        <Typography variant="body2" color="text.secondary">
          This is just the beginning of our journey. Pine is in active development, and your feedback is
          incredibly valuable in helping us build something you&apos;ll love to use.
          <br />
          We&apos;d love to hear your thoughts on our Substack or GitHub!
        </Typography>
        <Box sx={{mt: 2}}>
          <Link href="https://open.substack.com/pub/pinelang/p/discovering-pine-lang-simplifying?r=hkxog&utm_campaign=post&utm_medium=web&showWelcomeOnShare=false" target="_blank" sx={{ mx: 1 }}>
            Discovering Pine
          </Link>
          |
          <Link href="https://open.substack.com/pub/pinelang/p/insight-simplicity-delight?r=hkxog&utm_campaign=post&utm_medium=web&showWelcomeOnShare=false" target="_blank" sx={{ mx: 1 }}>
            Insight, Simplicity, Delight
          </Link>
        </Box>
      </Box>
    </Box>
  );
};
