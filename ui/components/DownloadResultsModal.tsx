import { Box, Modal, Typography, IconButton, TextField, Button } from '@mui/material';
import { Close } from '@mui/icons-material';
import React, { useState, useEffect, useRef } from 'react';

interface DownloadResultsModalProps {
  open: boolean;
  defaultFilename: string;
  csvContent: string;
  onClose: () => void;
}

const DownloadResultsModal: React.FC<DownloadResultsModalProps> = ({
  open,
  defaultFilename,
  csvContent,
  onClose,
}) => {
  const [filename, setFilename] = useState(defaultFilename);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update filename and select text when modal opens
  useEffect(() => {
    if (open) {
      setFilename(defaultFilename);
      // Select all text after a brief delay to ensure the input is rendered
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.select();
        }
      }, 50);
    }
  }, [open, defaultFilename]);

  const handleDownload = () => {
    if (!filename.trim()) {
      return;
    }

    // Ensure the filename has .csv extension
    const finalFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', finalFilename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onClose();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleDownload();
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
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
        {/* Header */}
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
            Export CSV
          </Typography>

          <IconButton
            onClick={onClose}
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

        {/* Filename Input */}
        <TextField
          autoFocus
          fullWidth
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
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

        {/* Actions */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button
            onClick={onClose}
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
            onClick={handleDownload}
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
            Download
          </Button>
        </Box>
      </Box>
    </Modal>
  );
};

export default DownloadResultsModal;

