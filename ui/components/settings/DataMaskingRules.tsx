import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import { Box, Button, IconButton, MenuItem, Switch, TextField, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef, useState } from 'react';
import type { AccessPolicy, AccessPolicyModule, ColumnMatcher } from '../../store/client';
import { useStores } from '../../store/store-container';
import { describeMatcher } from '../../utils/accessPolicy';
import ToggleRow from './ToggleRow';


/**
 * Data masking rules, edited on the Agent page (McpSection.tsx): a
 * database's own, or a rule set's on the Masking tab. Each connection has
 * its own policy, copied from a rule set (see beamlynx-desktop's
 * credential-store.ts).
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
  // False when the rule wasn't saved: the text stays, to try again.
  onAdd: (matcher: ColumnMatcher) => Promise<boolean>;
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
    if (await onAdd(matcher)) setText('');
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
    readOnly = false,
    save,
  }: {
    policy: AccessPolicy;
    module: AccessPolicyModule;
    focused: boolean;
    readOnly?: boolean;
    save: (change: Promise<AccessPolicy | null>) => Promise<boolean>;
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
          disabled={readOnly}
          onChange={(_e, value) => void save(global.setAccessPolicyRuleEnabled(policy.id, module.id, value))}
          inputProps={{ 'aria-label': `${describeMatcher(matcher)}: on` }}
        />
        {!readOnly && (
          <IconButton
            size="small"
            onClick={() => void save(global.removeAccessPolicyRule(policy.id, module.id))}
            aria-label={`Remove ${describeMatcher(matcher)}`}
            sx={{ color: 'var(--canvas-text-dim)', '&:hover': { color: 'var(--text-color)' } }}
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
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
  // The built-in recommended rules can't change: shown, not edited.
  const readOnly = !!policy.builtIn;
  const hides = policy.rules.filter(m => m.type === 'hide');
  const builtIns = policy.rules.filter(m => m.type !== 'hide' && m.builtIn);
  const shows = policy.rules.filter(m => m.type !== 'hide' && !m.builtIn);
  // Every edit goes through here, so one that wasn't saved says so instead
  // of looking done.
  const [error, setError] = useState('');
  const save = async (change: Promise<AccessPolicy | null>) => {
    try {
      if (await change) {
        setError('');
        return true;
      }
      setError("Couldn't save that to the data masking, so nothing changed. It may have been changed elsewhere.");
    } catch (e) {
      setError(`Couldn't save that to the data masking, so nothing changed. ${e instanceof Error ? e.message : String(e)}`);
    }
    // Show the policy as it is stored.
    void global.refreshAccessPolicies().catch(() => undefined);
    return false;
  };

  return (
    <>
      {error && (
        <Typography variant="body2" role="alert" sx={{ color: 'var(--text-warning-color)', mb: 2 }}>
          {error}
        </Typography>
      )}
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
              disabled={readOnly}
              onChange={checked => void save(global.setAccessPolicyRuleEnabled(policy.id, m.id, checked))}
            />
          );
        })}
        {shows.map(m => (
          <RuleRow key={m.id} policy={policy} module={m} focused={m.id === focusedRuleId} readOnly={readOnly} save={save} />
        ))}
        {!readOnly && (
          <AddRuleForm
            examples={{ contains: 'code', equals: 'status', suffix: '_code' }}
            onAdd={matcher => save(global.addAccessPolicyRule(policy.id, matcher))}
          />
        )}
      </RuleList>
      <RuleList
        title="Except"
        caption="Never shown, even when an Allow rule matches."
        icon={<BlockIcon sx={{ fontSize: 18, color: 'var(--text-warning-color)' }} />}
      >
        {hides.map(m => (
          <RuleRow key={m.id} policy={policy} module={m} focused={m.id === focusedRuleId} readOnly={readOnly} save={save} />
        ))}
        {!readOnly && (
          <AddRuleForm
            examples={{ contains: 'token', equals: 'email', suffix: '_key' }}
            onAdd={match => save(global.addAccessPolicyRule(policy.id, { type: 'hide', match }))}
          />
        )}
      </RuleList>
    </>
  );
});
