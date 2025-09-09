import { Box, Modal, Typography, IconButton, Tooltip } from '@mui/material';
import { Close } from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';
import { Session } from '../store/session';
import Input from './Input';
import { useStores } from '../store/store-container';
import { pineEscape } from '../store/util';

interface UpdateData {
  column: string;
  id: string | number;
  value: string;
  alias: string;
}

interface UpdateModalProps {
  session: Session;
  updateData: UpdateData;
}

const UpdateModal: React.FC<UpdateModalProps> = observer(({ session, updateData }) => {
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
    if (!session.updating || !updateData) {
      return;
    }

    const { column, id, value, alias } = updateData;

    // Reset virtual session state
    vs.setMessage('');
    vs.error = '';
    vs.loading = false;

    // Always start in Pine mode to ensure the build process triggers
    vs.setInputMode('pine');

    // Set up the update query
    vs.expression = session.expression;
    vs.prettify();
    vs.pipeAndUpdateExpression(`from: ${alias}`);
    vs.pipeAndUpdateExpression(
      `where: id = ${Number.isInteger(id) ? parseInt(id as string, 10) : `'${pineEscape(id as string)}'`}`,
    );
    vs.pipeAndUpdateExpression(`update! ${column} = '${pineEscape(value)}'`);

    // Update title to be more specific
    setTitle(`Update ${alias}.${column}`);
  }, [session.updating, updateData, vs, session.expression]);

  const handleClose = () => {
    session.updating = false;
  };

  return (
    <Modal open={session.updating} onClose={handleClose} aria-labelledby="update-modal-title">
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '80%',
          maxWidth: 800,
          bgcolor: 'var(--background-color)',
          border: '1px solid var(--border-color)',
          boxShadow: 24,
          p: 3,
          borderRadius: 2,
          outline: 'none',
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
          </Tooltip>
        </Box>

        {/* The Input component */}
        <Input session={vs} onRun={onRun} />
      </Box>
    </Modal>
  );
});

export default UpdateModal;
