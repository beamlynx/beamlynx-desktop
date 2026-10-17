import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import { Box, Button, IconButton, MenuItem, Switch, TextField, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { AccessPolicy, AccessPolicyModule, ColumnMatcher } from '../../store/client';
import { useStores } from '../../store/store-container';
import { describeMatcher } from '../../utils/accessPolicy';
import ToggleRow from './ToggleRow';

const REMOVE_CONFIRM_TIMEOUT_MS = 3000;

/**
 * Named, user-creatable access policies -- see GlobalStore.accessPolicies
 * and beamlynx-desktop's credential-store.ts. Each connection independently
 * selects which one applies to it (Database Connections section's own
 * per-row picker), or none.
 *
 * Each connection is checked on its own: MCP access can only be turned on
 * when that connection's policy is "None" (unrestricted) or has at least one
 * active rule. See GlobalStore.setMcpEnabled's refusal path and
 * ConnectionsSection's disabled MCP toggle.
 *
 * A policy's rules are shown as two lists: Hide, then Show, the order
 * pine-lang checks them in. A hide rule always wins.
 */

// The built-in show rules, in words. Every policy has these three; they can
// be switched off but not removed.
const BUILT_IN_DESCRIPTIONS: Record<string, { label: string; description: string }> = {
  'column-type': {
    label: 'Standard data types',
    description: 'UUIDs, numbers, dates, times, booleans and enums.',
  },
  'foreign-key': {
    label: 'Columns that reference another table',
    description: 'Shown even when stored as text.',
  },
  'column-name': {
    label: 'Names ending in “_id”',
    description: "A weaker signal: it doesn't look at the values.",
  },
};

type MatcherKind = 'contains' | 'equals' | 'suffix' | 'column';

const MATCHER_KINDS: { value: MatcherKind; label: string; placeholder: string }[] = [
  { value: 'contains', label: 'Name contains', placeholder: 'token' },
  { value: 'equals', label: 'Name is', placeholder: 'email' },
  { value: 'suffix', label: 'Name ends with', placeholder: '_key' },
  { value: 'column', label: 'Column', placeholder: 'table.column or schema.table.column' },
];

/** The matcher the add form describes, or why it can't make one. */
function matcherFromForm(kind: MatcherKind, text: string): ColumnMatcher | string {
  const value = text.trim();
  if (!value) return 'Type a name first.';
  if (kind !== 'column') return { type: 'column-name', [kind]: value };
  const parts = value.split('.');
  if (parts.some(p => !p.trim()) || parts.length < 2 || parts.length > 3) {
    return 'Write the column as table.column, or schema.table.column.';
  }
  const [schema, table, column] = parts.length === 3 ? parts : [null, ...parts];
  return { type: 'column', schema, table: table!, column: column! };
}

const AddRuleForm = ({ onAdd }: { onAdd: (matcher: ColumnMatcher) => Promise<void> }) => {
  const [kind, setKind] = useState<MatcherKind>('contains');
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    const matcher = matcherFromForm(kind, text);
    if (typeof matcher === 'string') {
      setError(matcher);
      return;
    }
    setError('');
    await onAdd(matcher);
    setText('');
  };

  const fieldSx = {
    '& .MuiInputBase-input': { fontFamily: 'var(--canvas-font)', fontSize: '13px', py: 0.75 },
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pt: 1.25 }}>
      <TextField
        select
        size="small"
        value={kind}
        onChange={e => setKind(e.target.value as MatcherKind)}
        sx={{ width: 150, flexShrink: 0, ...fieldSx }}
        aria-label="Kind of rule"
      >
        {MATCHER_KINDS.map(k => (
          <MenuItem key={k.value} value={k.value} sx={{ fontSize: '13px' }}>
            {k.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        fullWidth
        value={text}
        placeholder={MATCHER_KINDS.find(k => k.value === kind)?.placeholder}
        onChange={e => {
          setText(e.target.value);
          setError('');
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
        error={!!error}
        helperText={error || undefined}
        sx={fieldSx}
        aria-label="Column name"
      />
      <Button size="small" variant="outlined" onClick={() => void submit()} sx={{ flexShrink: 0, mt: '3px' }}>
        Add
      </Button>
    </Box>
  );
};

const RuleRow = observer(
  ({
    policy,
    module,
    focused,
  }: {
    policy: AccessPolicy;
    module: AccessPolicyModule;
    focused: boolean;
  }) => {
    const { global } = useStores();
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (focused) ref.current?.scrollIntoView({ block: 'center' });
    }, [focused]);
    const matcher = module.type === 'hide' ? module.match : module;
    return (
      <Box
        ref={ref}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          py: 0.5,
          px: 1,
          mx: -1,
          borderRadius: 1,
          borderBottom: '1px solid var(--border-color)',
          // Where the results grid's "Hidden from agents by a rule…" lands.
          backgroundColor: focused ? 'var(--node-column-bg)' : 'transparent',
          transition: 'background-color 1.2s ease',
        }}
      >
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--canvas-font)',
            fontSize: '13px',
            color: module.enabled ? 'var(--text-color)' : 'var(--canvas-text-dim)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {describeMatcher(matcher)}
        </Typography>
        <Switch
          size="small"
          checked={module.enabled}
          onChange={(_e, value) => global.setAccessPolicyRuleEnabled(policy.id, module.id, value)}
          inputProps={{ 'aria-label': `${describeMatcher(matcher)}: on` }}
        />
        <IconButton
          size="small"
          onClick={() => global.removeAccessPolicyRule(policy.id, module.id)}
          aria-label={`Remove ${describeMatcher(matcher)}`}
          sx={{ color: 'var(--canvas-text-dim)', '&:hover': { color: 'var(--text-color)' } }}
        >
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    );
  },
);

const RuleList = ({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) => (
  <Box sx={{ mb: 3 }}>
    <Typography variant="subtitle2" sx={{ color: 'var(--text-color)', fontFamily: 'var(--canvas-font)' }}>
      {title}
    </Typography>
    <Typography variant="caption" component="p" sx={{ color: 'var(--canvas-text-dim)', mb: 0.5 }}>
      {caption}
    </Typography>
    {children}
  </Box>
);

const PolicyRules = observer(({ policy, focusedRuleId }: { policy: AccessPolicy; focusedRuleId?: string }) => {
  const { global } = useStores();
  const hides = policy.rules.filter(m => m.type === 'hide');
  const builtIns = policy.rules.filter(m => m.type !== 'hide' && m.builtIn);
  const shows = policy.rules.filter(m => m.type !== 'hide' && !m.builtIn);

  return (
    <>
      <RuleList title="Hide" caption="Agents never see these columns, even when a Show rule matches them.">
        {hides.map(m => (
          <RuleRow key={m.id} policy={policy} module={m} focused={m.id === focusedRuleId} />
        ))}
        <AddRuleForm onAdd={async match => void (await global.addAccessPolicyRule(policy.id, { type: 'hide', match }))} />
      </RuleList>

      <RuleList title="Show" caption="Agents see these columns. Every other column is hidden.">
        {builtIns.map(m => {
          const text = BUILT_IN_DESCRIPTIONS[m.type] ?? { label: describeMatcher(m as ColumnMatcher), description: '' };
          return (
            <ToggleRow
              key={m.id}
              label={text.label}
              description={text.description}
              checked={m.enabled}
              onChange={checked => global.setAccessPolicyRuleEnabled(policy.id, m.id, checked)}
            />
          );
        })}
        {shows.map(m => (
          <RuleRow key={m.id} policy={policy} module={m} focused={m.id === focusedRuleId} />
        ))}
        <AddRuleForm onAdd={async matcher => void (await global.addAccessPolicyRule(policy.id, matcher))} />
      </RuleList>
    </>
  );
});

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

  // Opened from the results grid at one policy and rule (openAccessPolicy):
  // select that policy, and keep the rule picked out until the next visit.
  const [focusedRuleId, setFocusedRuleId] = useState<string | undefined>();
  const focus = global.accessPolicyFocus;
  useEffect(() => {
    if (!focus) return;
    setSelectedId(focus.policyId);
    setFocusedRuleId(focus.ruleId);
    global.clearAccessPolicyFocus();
  }, [focus, global]);

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
        A policy decides which columns an agent can see. A column is hidden unless a Show rule matches it, and a
        Hide rule always wins. Pick a policy for each connection under Database Connections. You can also
        right-click a column in the results to show or hide it.
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
          {selected && <PolicyRules policy={selected} focusedRuleId={focusedRuleId} />}
        </Box>
      </Box>
    </Box>
  );
};

export default observer(AccessPolicySection);
