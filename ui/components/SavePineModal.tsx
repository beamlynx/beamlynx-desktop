import { Box, Modal, Typography, IconButton, TextField, Button } from '@mui/material';
import { Close } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import React, { useEffect, useRef, useState } from 'react';
import { useStores } from '../store/store-container';
import { downloadTextFile } from '../store/util';

/**
 * Derives a filesystem-safe default filename from the first non-blank line
 * of a pine expression, e.g. "from: users | select: id, name" -> "from-users-select-id-name.pine".
 */
const defaultFilenameFor = (expression: string): string => {
  const firstLine = expression.split('\n').find(line => line.trim()) ?? '';
  const slug = firstLine
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${slug || 'query'}.pine`;
};

const SavePineModal = observer(() => {
  const { global } = useStores();
  const session = global.sessions[global.activeSessionId];
  const [filename, setFilename] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (global.showSaveModal && session) {
      setFilename(defaultFilenameFor(session.expression));
      setTimeout(() => inputRef.current?.select(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [global.showSaveModal]);

  const handleClose = () => global.setShowSaveModal(false);

  const handleSave = () => {
    if (!filename.trim() || !session) {
      return;
    }
    const finalFilename = filename.endsWith('.pine') ? filename : `${filename}.pine`;
    downloadTextFile(finalFilename, session.expression, 'text/plain;charset=utf-8;');
    handleClose();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  };

  return (
    <Modal open={global.showSaveModal} onClose={handleClose}>
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 450,
          bgcolor: 'var(--background-color)',
          border: '1px solid var(--border-color)',
          boxShadow: 24,
          p: 3,
          borderRadius: 2,
          outline: 'none',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
          }}
        >
          <Typography
            variant="h6"
            component="h2"
            sx={{
              color: 'var(--text-color)',
              fontWeight: 500,
            }}
          >
            Save Tab
          </Typography>

          <IconButton
            onClick={handleClose}
            size="small"
            sx={{
              color: 'var(--text-color)',
              '&:hover': {
                backgroundColor: 'var(--hover-color)',
              },
            }}
          >
            <Close fontSize="small" />
          </IconButton>
        </Box>

        <TextField
          autoFocus
          fullWidth
          value={filename}
          onChange={e => setFilename(e.target.value)}
          onKeyPress={handleKeyPress}
          variant="outlined"
          size="small"
          inputRef={inputRef}
          sx={{
            mb: 3,
            '& .MuiOutlinedInput-root': {
              color: 'var(--text-color)',
              '& fieldset': {
                borderColor: 'var(--border-color)',
              },
              '&:hover fieldset': {
                borderColor: 'var(--border-color)',
              },
              '&.Mui-focused fieldset': {
                borderColor: 'var(--primary-color)',
              },
            },
            '& .MuiInputBase-input': {
              color: 'var(--text-color)',
            },
          }}
        />

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button
            onClick={handleClose}
            sx={{
              color: 'var(--text-color)',
              '&:hover': {
                backgroundColor: 'var(--hover-color)',
              },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={!filename.trim()}
            sx={{
              bgcolor: 'var(--primary-color)',
              color: '#fff',
              '&:hover': {
                bgcolor: 'var(--primary-color)',
                opacity: 0.9,
              },
              '&:disabled': {
                bgcolor: 'var(--border-color)',
                color: 'var(--text-color-secondary)',
              },
            }}
          >
            Save
          </Button>
        </Box>
      </Box>
    </Modal>
  );
});

export default SavePineModal;
