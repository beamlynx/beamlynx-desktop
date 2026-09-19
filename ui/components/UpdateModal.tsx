import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import ModalSurface from './ModalSurface';
import { Close } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { runInAction } from 'mobx';
import React, { useEffect, useState } from 'react';
import { Session } from '../store/session';
import Input from './Input';
import { useStores } from '../store/store-container';

interface UpdateData {
  column: string;
  id: string | number;
  value: string;
  alias: string;
  updateExpression: string;
}

interface UpdateModalProps {
  updateExpression: string;
  updateData: UpdateData | null;
  /**
   * Separate from `updateData` being present: Result.tsx keeps this
   * component mounted through the closing transition (ModalSurface's
   * `closeAfterTransition`), so "has data" and "should be open" stop being
   * the same question the moment this animates.
   */
  open: boolean;
  onClose: () => void;
}

const UpdateModal: React.FC<UpdateModalProps> = observer(
  ({ updateExpression, updateData, open, onClose }) => {
    const { global } = useStores();
    const vs = global.getVirtualSession();
    const [title, setTitle] = useState('Review Update Query');

    const onRun = async () => {
      try {
        // Execute the update query
        const [messageRow, countRow] = await vs.evaluate();
        const message = messageRow[0];
        const count = countRow[0];
        setTitle(`✅ ${message}: ${count}`);
      } catch (error) {
        setTitle(`❌ Update execution failed`);
        console.error(error);
      }
    };

    // Set up the Pine expression when modal opens with update data
    useEffect(() => {
      // Null while the dialog is closed or on its way out -- there is
      // nothing to set up for a dialog nobody is opening.
      if (!updateData) return;
      const { column, alias } = updateData;

      // Reset virtual session state
      vs.setMessage('');
      runInAction(() => {
        vs.error = '';
        vs.loading = false;
      });

      // Always start in Pine mode to ensure the build process triggers
      vs.setInputMode('pine');

      // Use the pre-built update expression
      runInAction(() => {
        vs.expression = updateExpression;
      });

      // Update title to be more specific
      setTitle(`Update ${alias}.${column}`);
    }, [updateData, vs, updateExpression]);

    return (
      <ModalSurface
        open={open}
        onClose={onClose}
        aria-labelledby="update-modal-title"
        surfaceSx={{
          width: '80%',
          maxWidth: 800,
          p: 3,
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        {/* Header with title and close button */}
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
            {title}
          </Typography>

          <Tooltip title="Close without executing" placement="left">
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
          </Tooltip>
        </Box>

        {/* The Input component */}
        <Input session={vs} onRun={onRun} />
      </ModalSurface>
    );
  },
);

export default UpdateModal;
