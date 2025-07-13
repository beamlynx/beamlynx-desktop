import { RequiredVersion } from '../../constants';
import { Box, Typography, Button, Paper } from '@mui/material';
import { DockerCommand } from './DockerCommand';

export const PineServerNotRunning = () => {
  return (
    <Box sx={{ p: 4, maxWidth: '800px', mx: 'auto', textAlign: 'left' }}>
      <Typography
        variant="h4"
        component="h1"
        gutterBottom
        sx={{ fontWeight: 'bold', color: 'primary.main', textAlign: 'center', mb: 4 }}
      >
        Oops! Server is not running...
      </Typography>

      <DockerCommand description="To get started, run the Pine server using the Docker command below:" />
    </Box>
  );
}; 