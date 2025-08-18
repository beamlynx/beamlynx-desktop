import { RequiredVersion } from '../../constants';
import { Box, Typography, Link, Paper, Grid } from '@mui/material';
import { GitHub, Book, RssFeed } from '@mui/icons-material';
import { DockerCommand } from './DockerCommand';

export const Welcome = () => {
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
        I&apos;m building beamlynx on a simple belief: working with databases can be more intuitive - maybe
        even enjoyable.
      </Typography>

      <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
        It&apos;s still early days, and your honest feedback is vital. I&apos;d love to hear what you think.
      </Typography>

      <DockerCommand
        title="First things first..."
        description="To get started, run the server. The easiest way is with the Docker command below:"
        sx={{ mb: 6 }}
      />

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
