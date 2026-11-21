import { RequiredVersion } from '../../constants';
import { Box, Typography, Link, Grid, Alert } from '@mui/material';
import { GitHub, Book, RssFeed, Warning } from '@mui/icons-material';
import { DockerCommand } from './DockerCommand';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../store/store-container';

export const UpgradeRequired = observer(() => {
  const { global } = useStores();
  const currentVersion = global.version ?? 'unknown';

  return (
    <Box sx={{ p: 4, maxWidth: '800px', mx: 'auto', textAlign: 'left' }}>
      <Typography
        variant="h3"
        component="h1"
        gutterBottom
        sx={{ 
          fontWeight: 'bold', 
          color: 'primary.main', 
          textAlign: 'center', 
          mb: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2
        }}
      >
        <Warning sx={{ fontSize: 40, color: 'primary.main' }} />
        Upgrade Required
      </Typography>

      <Box 
        sx={{ 
          mb: 4,
          p: 3,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          backgroundColor: 'background.paper',
          boxShadow: 1
        }}
      >
        <Typography variant="body1" sx={{ mb: 2, color: 'text.primary' }}>
          Your Pine server version is outdated and needs to be upgraded to continue.
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          gap: 4, 
          flexWrap: 'wrap',
          backgroundColor: 'grey.50',
          borderRadius: 1,
          p: 2,
          ...(global.theme === 'dark' && {
            backgroundColor: 'grey.900'
          })
        }}>
          <Typography variant="body2" component="div">
            <Typography component="span" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
              Current version:
            </Typography>{' '}
            <Typography component="span" sx={{ fontFamily: 'monospace', color: 'error.main' }}>
              {currentVersion}
            </Typography>
          </Typography>
          <Typography variant="body2" component="div">
            <Typography component="span" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
              Required version:
            </Typography>{' '}
            <Typography component="span" sx={{ fontFamily: 'monospace', color: 'success.main' }}>
              {RequiredVersion}
            </Typography>
          </Typography>
        </Box>
      </Box>

      <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
        To upgrade your Pine server, please update to the latest version using the Docker command below:
      </Typography>

      <DockerCommand
        title="Upgrade your Pine server"
        description={`Pull and run the latest Pine server (v${RequiredVersion}):`}
        sx={{ mb: 6 }}
      />

      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        After running the upgrade command, refresh this page to continue using Pine.
      </Typography>

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
            <Typography>Documentation</Typography>
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
            <Typography>Release Notes</Typography>
          </Link>
        </Grid>
      </Grid>
    </Box>
  );
}); 