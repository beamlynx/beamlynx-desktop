import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import { Box, TextField, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useStores } from '../../store/store-container';
import ToggleRow from './ToggleRow';

const REMOVE_CONFIRM_TIMEOUT_MS = 3000;

/**
 * Named, user-creatable access policies -- see GlobalStore.accessPolicies
 * and beamlynx-desktop's credential-store.ts. Each connection independently
 * selects which one applies to it (Database Connections section's own
 * per-row picker), or none.
 *
 * MCP access isn't reachable for ANY connection unless at least one module
 * in at least one policy here is on -- see GlobalStore.setMcpEnabled's
 * refusal path and ConnectionsSection's disabled MCP toggle when nothing
 * anywhere is enabled.
 */
const MODULES: {
  type: 'column-type' | 'foreign-key' | 'column-name';
  label: string;
  description: string;
}[] = [
  {
    type: 'column-type',
    label: 'Allow standard data types',
    description: 'UUIDs, numbers, dates, times, booleans, and enums show their real value.',
  },
  {
    type: 'foreign-key',
    label: 'Allow identifier/reference columns',
    description: 'Columns that reference another table show their real value, even if stored as text.',
  },
  {
    type: 'column-name',
    label: 'Allow columns ending in "_id"',
    description: 'Any column named "_id" shows its real value. Weaker signal: it doesn\'t check the actual content.',
  },
];

const AccessPolicySection = () => {
  const { global } = useStores();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    };
  }, []);

  // Keep a selection alive across policy list changes: default to the
  // first policy once any exist, and fall back the same way if the
  // currently-selected one gets deleted out from under it.
  const selected = global.accessPolicies.find(p => p.id === selectedId) ?? global.accessPolicies[0];
  if (selected && selected.id !== selectedId) setSelectedId(selected.id);

  const startRename = (e: MouseEvent<SVGSVGElement>, id: string, currentName: string) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const commitRename = async (id: string) => {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    const current = global.accessPolicies.find(p => p.id === id);
    if (!trimmed || trimmed === current?.name) return;
    await global.renameAccessPolicy(id, trimmed);
  };

  const handleDeleteClick = (e: MouseEvent<SVGSVGElement>, id: string) => {
    e.stopPropagation();
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    if (confirmingDeleteId === id) {
      setConfirmingDeleteId(null);
      global.deleteAccessPolicy(id);
      return;
    }
    setConfirmingDeleteId(id);
    confirmTimeoutRef.current = setTimeout(() => setConfirmingDeleteId(null), REMOVE_CONFIRM_TIMEOUT_MS);
  };

  const handleCreate = async () => {
    const policy = await global.createAccessPolicy('New policy');
    if (policy) {
      setSelectedId(policy.id);
      setRenamingId(policy.id);
      setRenameValue(policy.name);
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Typography
        variant="h6"
        component="h2"
        sx={{
          flexShrink: 0,
          color: 'var(--text-color)',
          pb: 1.5,
          mb: 2,
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        Access Policy
      </Typography>

      <Typography variant="body2" sx={{ flexShrink: 0, color: 'var(--canvas-text-dim)', mb: 2 }}>
        Columns are masked unless a rule below allows them. Pick a policy per connection under Database Connections.
        MCP needs at least one active rule somewhere to turn on.
      </Typography>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 3 }}>
        <Box
          sx={{
            width: 180,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--border-color)',
            pr: 2,
          }}
        >
          <Box className="styled-scrollbar" sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {global.accessPolicies.map(policy => (
              <Box
                key={policy.id}
                onClick={() => setSelectedId(policy.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1,
                  py: 0.75,
                  cursor: 'pointer',
                  borderRadius: 1,
                  backgroundColor: policy.id === selected?.id ? 'var(--node-column-bg)' : 'transparent',
                  '&:hover': { backgroundColor: 'var(--node-column-bg)' },
                }}
              >
                {renamingId === policy.id ? (
                  <TextField
                    autoFocus
                    variant="standard"
                    size="small"
                    value={renameValue}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(policy.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRename(policy.id);
                      } else if (e.key === 'Escape') {
                        setRenamingId(null);
                      }
                    }}
                    sx={{
                      flex: 1,
                      '& .MuiInput-input': { py: 0, fontFamily: 'var(--canvas-font)', fontSize: '13px', color: 'var(--text-color)' },
                      '& .MuiInput-underline:before': { borderBottomColor: 'var(--border-color)' },
                    }}
                  />
                ) : (
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{
                      flex: 1,
                      fontFamily: 'var(--canvas-font)',
                      fontSize: '13px',
                      color: policy.id === selected?.id ? 'var(--text-color)' : 'var(--canvas-text-dim)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {policy.name}
                  </Typography>
                )}
                <EditIcon
                  onClick={e => startRename(e, policy.id, policy.name)}
                  titleAccess="Rename policy"
                  sx={{ fontSize: 14, cursor: 'pointer', opacity: 0.35, flexShrink: 0, '&:hover': { opacity: 0.9 } }}
                />
                <DeleteOutlineIcon
                  onClick={e => handleDeleteClick(e, policy.id)}
                  titleAccess={confirmingDeleteId === policy.id ? 'Click again to remove' : 'Remove policy'}
                  sx={{
                    fontSize: 14,
                    cursor: 'pointer',
                    flexShrink: 0,
                    opacity: confirmingDeleteId === policy.id ? 1 : 0.35,
                    color: confirmingDeleteId === policy.id ? 'var(--text-warning-color)' : 'inherit',
                    '&:hover': { opacity: 0.9 },
                  }}
                />
              </Box>
            ))}
          </Box>
          <Box
            onClick={handleCreate}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1,
              py: 0.75,
              mt: 1,
              cursor: 'pointer',
              color: 'var(--canvas-text-dim)',
              '&:hover': { color: 'var(--text-color)' },
            }}
          >
            <AddIcon sx={{ fontSize: 16 }} />
            <Typography variant="body2" sx={{ fontFamily: 'var(--canvas-font)', fontSize: '13px' }}>
              New policy
            </Typography>
          </Box>
        </Box>

        <Box className="styled-scrollbar" sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {!selected && (
            <Typography variant="body2" color="text.secondary">
              No policies yet -- create one to get started.
            </Typography>
          )}
          {selected &&
            MODULES.map(module => {
              const enabled = selected.rules.find(m => m.type === module.type)?.enabled ?? false;
              return (
                <ToggleRow
                  key={module.type}
                  label={module.label}
                  description={module.description}
                  checked={enabled}
                  onChange={checked => global.setAccessPolicyModuleEnabled(selected.id, module.type, checked)}
                />
              );
            })}
        </Box>
      </Box>
    </Box>
  );
};

export default observer(AccessPolicySection);
