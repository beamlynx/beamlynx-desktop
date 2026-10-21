import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
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
 * Policy templates -- see GlobalStore.policyTemplates and
 * beamlynx-desktop's credential-store.ts. A template is never applied to a
 * query: attaching one to a connection (Database Connections section's own
 * per-row picker) copies its rules into that connection's own policy, whose
 * rules are edited there, with PolicyRules below.
 *
 * A policy's rules are shown as two lists that read as one sentence: agents
 * see what the Allow rules match, except what the Except rules match. An
 * Except rule is a `hide` rule underneath, and always wins: pine-lang
 * checks those first, whatever order they're listed in here.
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

const AddRuleForm = ({
  onAdd,
  examples,
}: {
  onAdd: (matcher: ColumnMatcher) => Promise<void>;
  // A name that fits the list the form adds to, as each kind's placeholder.
  examples: Partial<Record<MatcherKind, string>>;
}) => {
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
    '& .MuiInputBase-root': { height: 32 },
    '& .MuiInputBase-input, & .MuiSelect-select': { fontFamily: 'var(--canvas-font)', fontSize: '13px', py: 0.75 },
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
        placeholder={examples[kind] ?? MATCHER_KINDS.find(k => k.value === kind)?.placeholder}
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
      <Button size="small" variant="outlined" onClick={() => void submit()} sx={{ flexShrink: 0, height: 32 }}>
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
      if (focused) ref.current?.scrollIntoView({ block: 'nearest' });
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
          // Indented only while picked out, so the text doesn't sit on the
          // highlight's edge.
          pl: focused ? 1 : 0,
          borderRadius: 1,
          borderBottom: '1px solid var(--border-color)',
          // Where the results grid's "Hidden from agents by a rule…" lands.
          backgroundColor: focused ? 'var(--node-column-bg)' : 'transparent',
          transition: 'background-color 1.2s ease, padding-left 0.2s ease',
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

// One list of rules: a heading that reads as one, with an icon for what the
// list does, and its rules in a card of their own. The two lists used to be
// set in the same type as the rules, and didn't read as headings.
const RuleList = ({
  title,
  caption,
  icon,
  children,
}: {
  title: string;
  caption: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) => (
  <Box component="section" sx={{ mb: 3 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'var(--text-color)' }}>
      {icon}
      <Typography component="h3" sx={{ fontFamily: 'var(--canvas-font)', fontSize: '15px', fontWeight: 600 }}>
        {title}
      </Typography>
    </Box>
    <Typography variant="caption" component="p" sx={{ color: 'var(--canvas-text-dim)', mt: 0.25, mb: 1 }}>
      {caption}
    </Typography>
    <Box
      sx={{
        border: '1px solid var(--border-color)',
        borderRadius: 1,
        px: 1.5,
        pb: 1.25,
        // The last rule's own bottom border would double the card's.
        '& > :not(:last-child)': { borderBottom: '1px solid var(--border-color)' },
      }}
    >
      {children}
    </Box>
  </Box>
);

export const PolicyRules = observer(({ policy, focusedRuleId }: { policy: AccessPolicy; focusedRuleId?: string }) => {
  const { global } = useStores();
  const hides = policy.rules.filter(m => m.type === 'hide');
  const builtIns = policy.rules.filter(m => m.type !== 'hide' && m.builtIn);
  const shows = policy.rules.filter(m => m.type !== 'hide' && !m.builtIn);

  return (
    <>
      <RuleList
        title="Allow"
        caption="Agents see the columns these match. Every other column is hidden."
        icon={<CheckCircleOutlineIcon sx={{ fontSize: 18, color: 'var(--canvas-trace)' }} />}
      >
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
        <AddRuleForm
          examples={{ contains: 'code', equals: 'status', suffix: '_code' }}
          onAdd={async matcher => void (await global.addAccessPolicyRule(policy.id, matcher))}
        />
      </RuleList>
      <RuleList
        title="Except"
        caption="Never shown, even when an Allow rule matches."
        icon={<BlockIcon sx={{ fontSize: 18, color: 'var(--text-warning-color)' }} />}
      >
        {hides.map(m => (
          <RuleRow key={m.id} policy={policy} module={m} focused={m.id === focusedRuleId} />
        ))}
        <AddRuleForm
          examples={{ contains: 'token', equals: 'email', suffix: '_key' }}
          onAdd={async match => void (await global.addAccessPolicyRule(policy.id, { type: 'hide', match }))}
        />
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

  // Opened at one template and rule (openAccessPolicy): select that
  // template, and keep the rule picked out until the next visit. A
  // connection's own policy is opened under Database Connections instead.
  const [focusedRuleId, setFocusedRuleId] = useState<string | undefined>();
  const focus = global.accessPolicyFocus;
  const templates = global.policyTemplates;
  useEffect(() => {
    if (!focus || !templates.some(t => t.id === focus.policyId)) return;
    setSelectedId(focus.policyId);
    setFocusedRuleId(focus.ruleId);
    global.clearAccessPolicyFocus();
  }, [focus, global, templates]);

  // Keep a selection alive across policy list changes: default to the
  // first policy once any exist, and fall back the same way if the
  // currently-selected one gets deleted out from under it.
  const selected = templates.find(p => p.id === selectedId) ?? templates[0];
  if (selected && selected.id !== selectedId) setSelectedId(selected.id);

  const startRename = (e: MouseEvent<SVGSVGElement>, id: string, currentName: string) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const commitRename = async (id: string) => {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    const current = templates.find(p => p.id === id);
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
    const policy = await global.createAccessPolicy('New template');
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
        Policy templates
      </Typography>

      <Typography variant="body2" sx={{ flexShrink: 0, color: 'var(--canvas-text-dim)', mb: 2 }}>
        Each connection has its own access policy, which decides which columns an agent can see there. A template is
        where a connection&apos;s policy starts: attaching one under Database Connections copies its rules into the
        connection. Changing a template doesn&apos;t change connections already made from it. Every column is hidden
        unless an Allow rule matches it. Except rules take columns back out: a column they match stays hidden, even
        when an Allow rule matches it.
      </Typography>

      {/* The policies as a strip above the rules, not a column beside
          them: the settings panel is narrow, and the rules need its width. */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box
          sx={{
            flexShrink: 0,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 0.5,
            borderBottom: '1px solid var(--border-color)',
            pb: 1.5,
          }}
        >
          {templates.map(policy => (
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
                  maxWidth: '100%',
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
                      width: 140,
                      '& .MuiInput-input': { py: 0, fontFamily: 'var(--canvas-font)', fontSize: '13px', color: 'var(--text-color)' },
                      '& .MuiInput-underline:before': { borderBottomColor: 'var(--border-color)' },
                    }}
                  />
                ) : (
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{
                      minWidth: 0,
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
                  titleAccess="Rename template"
                  sx={{ fontSize: 14, cursor: 'pointer', opacity: 0.35, flexShrink: 0, '&:hover': { opacity: 0.9 } }}
                />
                <DeleteOutlineIcon
                  onClick={e => handleDeleteClick(e, policy.id)}
                  titleAccess={confirmingDeleteId === policy.id ? 'Click again to remove' : 'Remove template'}
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
          <Box
            onClick={handleCreate}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1,
              py: 0.75,
              cursor: 'pointer',
              color: 'var(--canvas-text-dim)',
              '&:hover': { color: 'var(--text-color)' },
            }}
          >
            <AddIcon sx={{ fontSize: 16 }} />
            <Typography variant="body2" sx={{ fontFamily: 'var(--canvas-font)', fontSize: '13px' }}>
              New template
            </Typography>
          </Box>
        </Box>

        <Box className="styled-scrollbar" sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {!selected && (
            <Typography variant="body2" color="text.secondary">
              No templates yet -- create one to get started.
            </Typography>
          )}
          {selected && <PolicyRules policy={selected} focusedRuleId={focusedRuleId} />}
        </Box>
      </Box>
    </Box>
  );
};

export default observer(AccessPolicySection);
