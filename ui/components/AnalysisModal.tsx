import { Box, Button, Modal, TextField, Typography, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useState, useEffect } from 'react';
import { useStores } from '../store/store-container';
import { analysisTemplates, runAnalysis } from '../utils/analysisTemplates';

interface AnalysisModalProps {
  initialValue?: string;
}

const AnalysisModal = ({ initialValue = '' }: AnalysisModalProps) => {
  const { global } = useStores();
  const [analysisInput, setAnalysisInput] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string|null>(null);

  // Set initial value when modal opens
  useEffect(() => {
    if (global.showAnalysis) {
      setAnalysisInput(initialValue);
    }
  }, [global.showAnalysis, initialValue]);

  const handleAnalyse = () => {
    if (!selectedTemplateId) {
      return;
    }
    runAnalysis(analysisInput, selectedTemplateId, global);
    global.setShowAnalysis(false);
    setAnalysisInput('');
    setSelectedTemplateId(null);
  };

  const handleClose = () => {
    global.setShowAnalysis(false);
    setAnalysisInput('');
    setSelectedTemplateId(null);
  };

  return (
    <Modal
      open={global.showAnalysis}
      onClose={handleClose}
      aria-labelledby="analysis-modal-title"
      aria-describedby="analysis-modal-description"
    >
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 500,
          bgcolor: 'var(--background-color)',
          border: '1px solid var(--border-color)',
          boxShadow: 24,
          p: 4,
          borderRadius: 2,
          outline: 'none',
        }}
      >
        <Typography variant="h6" component="h2" gutterBottom sx={{ color: 'var(--text-color)' }}>
          Analysis
        </Typography>

        <Typography variant="body2" sx={{ color: 'var(--text-color)', mb: 2 }}>
          Enter your analysis parameters. This will run the relevant queries.
        </Typography>

        <TextField
          fullWidth
          margin="dense"
          label="Analysis Input"
          value={analysisInput}
          onChange={e => setAnalysisInput(e.target.value)}
          multiline
          rows={3}
          sx={{
            mb: 2,
            '& .MuiInputLabel-root': { color: 'var(--text-color)' },
            '& .MuiInputLabel-root.Mui-focused': { color: 'var(--primary-color)' },
            '& .MuiOutlinedInput-root': {
              color: 'var(--text-color)',
              '& fieldset': { borderColor: 'var(--border-color)' },
              '&:hover fieldset': { borderColor: 'var(--text-color)' },
              '&.Mui-focused fieldset': { borderColor: 'var(--primary-color)' },
            },
          }}
        />

        <FormControl fullWidth margin="dense">
          <InputLabel sx={{ color: 'var(--text-color)' }}>Analysis Template</InputLabel>
          <Select
            value={selectedTemplateId}
            onChange={e => setSelectedTemplateId(e.target.value)}
            label="Analysis Template"
            sx={{
              color: 'var(--text-color)',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border-color)' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--text-color)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary-color)' },
            }}
          >
            {analysisTemplates.map(template => (
              <MenuItem key={template.id} value={template.id}>
                {template.id}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box
          sx={{
            mt: 3,
            display: 'flex',
            gap: 2,
            justifyContent: 'flex-end',
          }}
        >
          <Button
            variant="contained"
            onClick={handleAnalyse}
            disabled={!analysisInput.trim() || !selectedTemplateId}
            sx={{
              backgroundColor: 'var(--primary-color)',
              color: 'var(--primary-text-color)',
              '&:hover': {
                backgroundColor: 'var(--primary-color-hover)',
              },
              '&:disabled': {
                backgroundColor: 'var(--icon-color)',
                color: 'var(--text-color)',
                opacity: 0.6,
              },
            }}
          >
            Analyse
          </Button>
        </Box>
      </Box>
    </Modal>
  );
};

export default observer(AnalysisModal); 