import { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { resetPreferences } from '../store/preferences';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * The last line of defence against a blank page. Any error thrown while
 * rendering the app lands here instead of unmounting everything. It says
 * what happened and offers two ways out: reload, or clear stored
 * preferences and reload. Open tabs are kept either way.
 *
 * Stored preferences are the usual cause of an error that survives a
 * reload: a value saved by an older version of the app that this one no
 * longer understands.
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] render failed ->', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Box
        role="alert"
        sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          px: 4,
          textAlign: 'center',
        }}
      >
        <Typography variant="h6">Something went wrong</Typography>
        <Typography variant="body2" sx={{ maxWidth: 560, color: 'text.secondary', wordBreak: 'break-word' }}>
          {error.message || String(error)}
        </Typography>
        <Typography variant="body2" sx={{ maxWidth: 560, color: 'text.secondary' }}>
          If this happens again after reloading, resetting your preferences usually fixes it. Your open tabs are
          kept.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Button
            onClick={() => {
              resetPreferences();
              window.location.reload();
            }}
          >
            Reset preferences and reload
          </Button>
        </Box>
      </Box>
    );
  }
}
