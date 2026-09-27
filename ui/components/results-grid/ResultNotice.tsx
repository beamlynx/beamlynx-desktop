import { CheckCircleOutline, Close, ErrorOutline, InfoOutlined } from '@mui/icons-material';
import { Box, IconButton, Snackbar } from '@mui/material';
import React from 'react';

export interface Notice {
  kind: 'success' | 'error' | 'info';
  text: string;
}

interface ResultNoticeProps {
  notice: Notice | null;
  onClose: () => void;
}

// How long each kind stays up. An error is kept longest: it is the one
// someone may need to read twice, or act on.
const DURATION: Record<Notice['kind'], number> = { success: 3000, info: 4500, error: 9000 };

const ICON: Record<Notice['kind'], React.ReactNode> = {
  success: <CheckCircleOutline fontSize="small" sx={{ color: 'var(--canvas-trace)' }} />,
  info: <InfoOutlined fontSize="small" sx={{ color: 'var(--canvas-text-dim)' }} />,
  error: <ErrorOutline fontSize="small" sx={{ color: 'var(--canvas-warn)' }} />,
};

/**
 * A short message about the results grid, shown inside the results pane
 * rather than at the edge of the window, so it appears next to the cell it
 * is about: what an edit changed, why it failed, or why a value can't be
 * edited at all.
 */
const ResultNotice: React.FC<ResultNoticeProps> = ({ notice, onClose }) => (
  <Snackbar
    // Keyed on the text so a second message replaces the first and restarts
    // its timer, instead of being swallowed while the first is still up.
    key={notice?.text}
    open={!!notice}
    autoHideDuration={notice ? DURATION[notice.kind] : null}
    onClose={(_, reason) => {
      // A click elsewhere is usually the next action, not "I've read this".
      if (reason === 'clickaway') return;
      onClose();
    }}
    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    sx={{ position: 'absolute', bottom: 'calc(28px * var(--text-scale, 1))' }}
  >
    <Box
      role={notice?.kind === 'error' ? 'alert' : 'status'}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        maxWidth: 560,
        pl: 1.25,
        pr: 0.5,
        py: 0.75,
        backgroundColor: 'var(--canvas-picker-bg)',
        border: '1px solid var(--canvas-picker-border)',
        borderRadius: '4px',
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.22)',
        color: 'var(--canvas-text)',
        fontFamily: 'var(--canvas-font)',
        fontSize: 'calc(13px * var(--text-scale, 1))',
        lineHeight: 1.45,
      }}
    >
      <Box sx={{ display: 'flex', pt: '1px', flexShrink: 0 }}>{notice && ICON[notice.kind]}</Box>
      <Box sx={{ py: '1px', overflowWrap: 'anywhere' }}>{notice?.text}</Box>
      <IconButton
        size="small"
        onClick={onClose}
        aria-label="Dismiss"
        sx={{ color: 'var(--canvas-text-dim)', p: '2px', ml: 0.5, flexShrink: 0 }}
      >
        <Close sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  </Snackbar>
);

export default ResultNotice;
