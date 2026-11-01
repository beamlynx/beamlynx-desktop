import { useCallback, useEffect, useRef, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { observer } from 'mobx-react-lite';
import { isDesktop } from '../../store/util';
import { useStores } from '../../store/store-container';
import {
  agentAccessOf,
  type AccessPolicy,
  type AgentAccess,
  type ConnectionInfo,
} from '../../store/client';
import ConfirmDialog from '../ConfirmDialog';
import InfoHint from '../InfoHint';
import ToggleRow from './ToggleRow';
import { PolicyRules } from './DataMaskingRules';

const CopyBlock = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);

  return (
    <Box
      sx={{
        p: 2,
        pr: 9,
        backgroundColor: 'grey.900',
        borderRadius: 1,
        fontFamily: 'monospace',
        // Fixed, not rem -- this modal's own chrome is frozen at one scale
        // regardless of the Text Size setting (see SettingsPanelContent.tsx's
        // settingsTheme comment for why).
        fontSize: '12.8px',
        color: '#f8f8f2',
        position: 'relative',
        whiteSpace: 'pre-wrap',
        // 'anywhere' only breaks mid-word when a line (e.g. a long path)
        // can't wrap at a space -- unlike 'break-all', it doesn't fragment
        // every line into single characters.
        overflowWrap: 'anywhere',
      }}
    >
      <code>{text}</code>
      <Button
        variant="contained"
        size="small"
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        sx={{ position: 'absolute', top: 8, right: 8 }}
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </Button>
    </Box>
  );
};

/**
 * The Setup tab: how to register this install as an MCP server --
 * deliberately just instructions, not a button that writes into an
 * agent's config file itself. Registration is the agent's own concern (its
 * own config format, its own consent flow); a third-party app silently
 * editing that file would cross a trust boundary that isn't this app's to
 * cross. See beamlynx-plans/completed/2026-08-15-mcp-server-and-url-scheme.md.
 *
 * Claude Code's command and the JSON for other clients are shown one
 * under the other, not as tabs: the page's own tabs sit just above.
 */
const SetupInstructions = ({ onDone }: { onDone: () => void }) => {
  const [setupInfo, setSetupInfo] = useState<{
    name: string;
    command: string;
    args: string[];
  } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return;
    window.beamlynxDesktop.mcp.getSetupInfo().then(setSetupInfo);
  }, []);

  const claudeCodeCommand = setupInfo
    ? [
        `claude mcp add ${setupInfo.name} -- \\`,
        `    "${setupInfo.command}" \\`,
        ...setupInfo.args.map((arg, i) =>
          i === setupInfo.args.length - 1 ? `    ${arg}` : `    ${arg} \\`,
        ),
      ].join('\n')
    : 'Loading…';

  const manualJson = setupInfo
    ? JSON.stringify(
        {
          mcpServers: {
            [setupInfo.name]: { type: 'stdio', command: setupInfo.command, args: setupInfo.args },
          },
        },
        null,
        2,
      )
    : 'Loading…';

  const headingSx = { fontWeight: 600, color: 'var(--text-color)', mb: 0.5 } as const;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="subtitle2" component="h3" sx={headingSx}>
          Claude Code
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Run this in a terminal:
        </Typography>
        <CopyBlock text={claudeCodeCommand} />
      </Box>
      <Box>
        <Typography variant="subtitle2" component="h3" sx={headingSx}>
          Other MCP clients
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Paste this into the client&apos;s MCP config, such as Claude Desktop&apos;s{' '}
          <code>claude_desktop_config.json</code>:
        </Typography>
        <CopyBlock text={manualJson} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ color: 'var(--text-color)' }}>
          Then choose the databases it can use.
        </Typography>
        <Button size="small" onClick={onDone} sx={actionSx}>
          Choose databases
        </Button>
      </Box>
    </Box>
  );
};

// Every action that is a text button, as in ConnectionsSection.tsx.
const actionSx = {
  textTransform: 'none',
  color: 'var(--primary-color)',
  px: 0.75,
  fontSize: 13,
} as const;
const actionIconSx = { fontSize: 16 } as const;

/**
 * What agents can do on a database, in a few words, on its collapsed line:
 * "Masked" with its rule count, "Every column" in the warning colour, or
 * nothing when off (the name is dimmed instead).
 */
const AccessStatus = ({ access, rulesOn }: { access: AgentAccess; rulesOn: number }) => {
  if (access === 'off') return null;
  if (access === 'every-column') {
    return (
      <Typography
        component="span"
        sx={{ fontSize: 12.5, color: 'var(--text-warning-color)', whiteSpace: 'nowrap' }}
      >
        Every column
      </Typography>
    );
  }
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, whiteSpace: 'nowrap' }}
    >
      <Box
        component="span"
        sx={{
          fontSize: 12,
          lineHeight: '18px',
          px: 0.75,
          borderRadius: '9px',
          border: '1px solid var(--border-color)',
          color: 'var(--text-color)',
        }}
      >
        Masked
      </Box>
      <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--canvas-text-dim)' }}>
        {rulesOn} rule{rulesOn === 1 ? '' : 's'} on
      </Typography>
    </Box>
  );
};

/**
 * One database on the Agent page. Collapsed, it is one line: its name and
 * what agents can do on it. Expanded (one at a time, see AgentDatabases),
 * it holds the Off / Masked / Every column switch and its data masking.
 *
 * Turning a database on masks it with the recommended rules straight away:
 * the safe choice needs no question. Every column asks first, since it
 * weakens protection. "Start over from" replaces the rules with a copy of
 * a rule set from the Masking tab.
 *
 * The rules underneath are a policy copied from a template (GlobalStore.
 * policyTemplates). The word "template" stays out of the UI: people think
 * "the recommended rules" or "the same as my other database".
 */
const AgentDatabaseRow = observer(
  ({
    connection,
    expanded,
    onToggle,
    focusedRuleId,
  }: {
    connection: ConnectionInfo;
    expanded: boolean;
    onToggle: () => void;
    focusedRuleId?: string;
  }) => {
    const { global } = useStores();
    const { id, label, applyPolicyToOwnQueries } = connection;
    const ownPolicy = global.connectionPolicy(id);
    const rulesOn = ownPolicy?.rules.filter(m => m.enabled).length ?? 0;
    const access = agentAccessOf(connection);
    const [asking, setAsking] = useState<'every-column' | 'start-over' | null>(null);
    const [startFrom, setStartFrom] = useState('');
    const rowRef = useRef<HTMLDivElement>(null);

    // Opened at this database: bring it into view.
    useEffect(() => {
      if (expanded && focusedRuleId !== undefined)
        rowRef.current?.scrollIntoView({ block: 'nearest' });
    }, [expanded, focusedRuleId]);

    const recommendedId =
      global.policyTemplates.find(t => t.builtIn)?.id ?? global.policyTemplates[0]?.id ?? '';
    // What the rules can start over from: the sets on the Masking tab,
    // Recommended first. Never another database's rules: databases can
    // have different schemas, so those rarely fit.
    const ruleSets = global.policyTemplates;

    const chooseAccess = (next: AgentAccess | null) => {
      if (!next || next === access) return;
      if (next === 'every-column') return setAsking('every-column');
      void global.setAgentAccess(
        id,
        next,
        next === 'masked' && !ownPolicy ? recommendedId : undefined,
      );
    };

    const startOver = () => {
      setStartFrom(recommendedId);
      setAsking('start-over');
    };
    const applyStartOver = async () => {
      await global.attachTemplate(id, startFrom);
    };

    return (
      <Box ref={rowRef} sx={{ borderBottom: '1px solid var(--border-color)' }}>
        <Box
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-label={`${label}: ${expanded ? 'hide' : 'show'} what agents can do`}
          onClick={onToggle}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            }
          }}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 1,
            cursor: 'pointer',
            outline: 'none',
            backgroundColor: expanded ? 'var(--node-column-bg)' : 'transparent',
            '&:hover': { backgroundColor: 'var(--node-column-bg)' },
            '&:focus-visible': { outline: '2px solid var(--primary-color)', outlineOffset: '-2px' },
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              backgroundColor: global.getConnectionColor(id) || 'var(--border-color)',
              opacity: access === 'off' ? 0.5 : 1,
            }}
          />
          <Typography
            variant="body2"
            title={label}
            sx={{
              flex: 1,
              minWidth: 0,
              fontFamily: 'var(--canvas-font)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: access === 'off' ? 'var(--canvas-text-dim)' : 'var(--text-color)',
            }}
          >
            {label}
          </Typography>
          <AccessStatus access={access} rulesOn={rulesOn} />
          <ExpandMoreIcon
            sx={{
              fontSize: 18,
              flexShrink: 0,
              color: 'var(--icon-color)',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 150ms',
            }}
          />
        </Box>

        {expanded && (
          <Box
            sx={{
              px: 1.5,
              pl: 3.5,
              pt: 1.5,
              pb: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            <ToggleButtonGroup
              exclusive
              size="small"
              value={access}
              onChange={(_e, next) => chooseAccess(next)}
              aria-label={`What agents can do on ${label}`}
              sx={{
                alignSelf: 'flex-start',
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  px: 1.5,
                  py: 0.25,
                  fontSize: 13,
                },
                '& .MuiToggleButton-root.Mui-selected[value="every-column"]': {
                  color: 'var(--text-warning-color)',
                  borderColor: 'var(--text-warning-color)',
                },
              }}
            >
              <ToggleButton value="off">Off</ToggleButton>
              <ToggleButton value="masked">Masked</ToggleButton>
              <ToggleButton value="every-column">Every column</ToggleButton>
            </ToggleButtonGroup>

            {access === 'off' && (
              <Typography variant="body2" sx={{ color: 'var(--canvas-text-dim)' }}>
                Agents can&apos;t use this database. Masked lets them, and hides columns that may
                hold personal or secret data.
              </Typography>
            )}

            {access === 'every-column' && (
              <Alert severity="warning" sx={{ py: 0.25, '& .MuiAlert-message': { fontSize: 13 } }}>
                Agents read every column of this database, unmasked.
              </Alert>
            )}

            {access === 'masked' && ownPolicy && (
              <>
                {rulesOn === 0 && (
                  <Typography variant="body2" sx={{ color: 'var(--text-warning-color)' }}>
                    No rule is on, so nothing is masked. Turn a rule on.
                  </Typography>
                )}
                <ToggleRow
                  label="Mask my own queries too"
                  description="See what agents see: data masking applies to your own queries on this database as well."
                  descriptionInTooltip
                  divider={false}
                  checked={!!applyPolicyToOwnQueries}
                  onChange={value => global.setApplyPolicyToOwnQueries(id, value)}
                />
                <Button
                  size="small"
                  onClick={startOver}
                  startIcon={<RestartAltIcon sx={actionIconSx} />}
                  sx={{ ...actionSx, alignSelf: 'flex-start', ml: -0.75 }}
                >
                  Start over from…
                </Button>
                <Box>
                  <PolicyRules policy={ownPolicy} focusedRuleId={focusedRuleId} />
                </Box>
              </>
            )}
          </Box>
        )}

        <ConfirmDialog
          open={asking === 'start-over'}
          title={`Start ${label}'s data masking over?`}
          confirmLabel="Start over"
          confirmDisabled={!startFrom}
          onConfirm={applyStartOver}
          onClose={() => setAsking(null)}
        >
          <p>
            Its {ownPolicy?.rules.length ?? 0} rules are replaced by a copy of the set you pick,
            including any rule you added. No other database changes. The sets are on the Masking
            tab.
          </p>
          <TextField
            select
            fullWidth
            size="small"
            label="Start from"
            value={startFrom}
            onChange={e => setStartFrom(e.target.value)}
            sx={{ mt: 1 }}
          >
            {ruleSets.map(t => (
              <MenuItem key={t.id} value={t.id} disabled={!t.rules.some(m => m.enabled)}>
                {ruleSetName(t)}
                {!t.rules.some(m => m.enabled) ? ' (no rule on)' : ''}
              </MenuItem>
            ))}
          </TextField>
        </ConfirmDialog>

        <ConfirmDialog
          open={asking === 'every-column'}
          title="Let agents read every column?"
          confirmLabel="Allow every column"
          danger
          onConfirm={() => global.setAgentAccess(id, 'every-column')}
          onClose={() => setAsking(null)}
        >
          <p>
            Agents on {label} will read every column of this database, unmasked, including any
            column data masking hides today. Nothing here will limit what they see.
          </p>
          {ownPolicy && (
            <p>Its data masking rules are kept. Switch back to Masked to apply them again.</p>
          )}
        </ConfirmDialog>
      </Box>
    );
  },
);

/**
 * The Databases tab: every saved database, one line each, in the same
 * order as Database Connections, so turning one on never moves it. One
 * opens at a time. Every database starts Off, and adding one asks nothing
 * about agents.
 */
const AgentDatabases = observer(
  ({
    focus,
    onFocused,
  }: {
    focus: { connectionId: string; ruleId?: string } | null;
    onFocused: () => void;
  }) => {
    const { global } = useStores();
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [focusedRuleId, setFocusedRuleId] = useState<string | undefined>();

    // Opened at one database (openAgentDatabase): open it, with the rule
    // asked about picked out.
    useEffect(() => {
      if (!focus) return;
      setExpandedId(focus.connectionId);
      setFocusedRuleId(focus.ruleId ?? '');
      onFocused();
    }, [focus, onFocused]);

    if (global.connections.length === 0) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            No databases yet.
          </Typography>
          <Button size="small" onClick={() => global.openAddConnection()} sx={actionSx}>
            Add a database
          </Button>
        </Box>
      );
    }
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            Choose the databases your agent can use.
          </Typography>
          <InfoHint
            text={
              <>
                <b>Off:</b> agents can&apos;t use this database.
                <br />
                <b>Masked:</b> data masking hides columns that may hold personal or secret data.
                They come back as xxxxx. Agents can still filter and join on them.
                <br />
                <b>Every column:</b> agents read every column, unmasked.
              </>
            }
          />
        </Box>
        <Box sx={{ borderTop: '1px solid var(--border-color)' }}>
          {global.connections.map(c => (
            <AgentDatabaseRow
              key={c.id}
              connection={c}
              expanded={expandedId === c.id}
              onToggle={() => {
                setFocusedRuleId(undefined);
                setExpandedId(expandedId === c.id ? null : c.id);
              }}
              focusedRuleId={expandedId === c.id ? focusedRuleId : undefined}
            />
          ))}
        </Box>
      </Box>
    );
  },
);

/**
 * A rule set's name as people see it. The built-in one is stored as
 * "Default"; on screen it is Recommended, as everywhere else.
 */
const ruleSetName = (set: AccessPolicy) => (set.builtIn ? 'Recommended' : set.name);

/**
 * The Masking tab: the rule sets a database's data masking starts from.
 * Recommended is built in and can't change. People can make their own,
 * named, and edit, rename or delete them. A database gets a copy, so a
 * change here never reaches a database that already started from it.
 *
 * Underneath these are policy templates (GlobalStore.policyTemplates),
 * but the UI never calls them that.
 */
const MaskingRuleSets = observer(() => {
  const { global } = useStores();
  const sets = global.policyTemplates;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Keep a selection: the first set, and again if the selected one is deleted.
  const selected = sets.find(p => p.id === selectedId) ?? sets[0];
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const commitRename = async (id: string) => {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    const current = sets.find(p => p.id === id);
    if (!trimmed || trimmed === current?.name) return;
    await global.renameAccessPolicy(id, trimmed);
  };

  const create = async () => {
    const set = await global.createAccessPolicy('New rule set');
    if (set) {
      setSelectedId(set.id);
      setRenamingId(set.id);
      setRenameValue(set.name);
    }
  };

  const iconSx = {
    fontSize: 14,
    cursor: 'pointer',
    opacity: 0.35,
    flexShrink: 0,
    '&:hover': { opacity: 0.9 },
  } as const;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          The rules a database starts from. Turning a database on uses Recommended. Pick another set
          with Start over from… on the database.
        </Typography>
        <InfoHint text="Masked columns come back as xxxxx. Agents can still filter and join on them. A database gets a copy of the set, so changing a set here doesn't change databases that already use it." />
      </Box>

      {/* The sets as a strip above the rules, not a column beside them:
          the panel is narrow, and the rules need its width. */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 0.5,
          borderBottom: '1px solid var(--border-color)',
          pb: 1.5,
          mb: 2,
        }}
      >
        {sets.map(set => (
          <Box
            key={set.id}
            role="button"
            tabIndex={0}
            aria-pressed={set.id === selected?.id}
            onClick={() => setSelectedId(set.id)}
            onKeyDown={e => {
              if (renamingId === set.id) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelectedId(set.id);
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1,
              py: 0.75,
              cursor: 'pointer',
              borderRadius: 1,
              maxWidth: '100%',
              outline: 'none',
              backgroundColor: set.id === selected?.id ? 'var(--node-column-bg)' : 'transparent',
              '&:hover': { backgroundColor: 'var(--node-column-bg)' },
              '&:focus-visible': {
                outline: '2px solid var(--primary-color)',
                outlineOffset: '-2px',
              },
            }}
          >
            {renamingId === set.id ? (
              <TextField
                autoFocus
                variant="standard"
                size="small"
                value={renameValue}
                onClick={e => e.stopPropagation()}
                onFocus={e => e.target.select()}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => commitRename(set.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void commitRename(set.id);
                  } else if (e.key === 'Escape') {
                    setRenamingId(null);
                  }
                }}
                sx={{
                  width: 140,
                  '& .MuiInput-input': {
                    py: 0,
                    fontFamily: 'var(--canvas-font)',
                    fontSize: '13px',
                    color: 'var(--text-color)',
                  },
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
                  color: set.id === selected?.id ? 'var(--text-color)' : 'var(--canvas-text-dim)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {ruleSetName(set)}
              </Typography>
            )}
            {!set.builtIn && renamingId !== set.id && (
              <>
                <EditIcon
                  onClick={e => {
                    e.stopPropagation();
                    setRenamingId(set.id);
                    setRenameValue(set.name);
                  }}
                  titleAccess={`Rename ${set.name}`}
                  sx={iconSx}
                />
                <DeleteOutlineIcon
                  onClick={e => {
                    e.stopPropagation();
                    setConfirmingDeleteId(set.id);
                  }}
                  titleAccess={`Delete ${set.name}`}
                  sx={iconSx}
                />
              </>
            )}
          </Box>
        ))}
        <Button
          size="small"
          onClick={create}
          startIcon={<AddIcon sx={actionIconSx} />}
          sx={actionSx}
        >
          New rule set
        </Button>
      </Box>

      {selected?.builtIn && (
        <Typography variant="body2" sx={{ color: 'var(--canvas-text-dim)', mb: 2 }}>
          Built in, so it can&apos;t change. For other rules, make a new rule set.
        </Typography>
      )}
      {selected && <PolicyRules policy={selected} />}

      <ConfirmDialog
        open={confirmingDeleteId !== null}
        title={`Delete “${sets.find(t => t.id === confirmingDeleteId)?.name ?? ''}”?`}
        confirmLabel="Delete rule set"
        danger
        onConfirm={async () => {
          if (confirmingDeleteId) await global.deleteAccessPolicy(confirmingDeleteId);
        }}
        onClose={() => setConfirmingDeleteId(null)}
      >
        <p>Databases that started from it keep their own copies of its rules.</p>
      </ConfirmDialog>
    </Box>
  );
});

/**
 * The desktop Agent page: three tabs. Databases chooses what agents can use
 * and how each is masked; Masking holds the rule sets they start from;
 * Setup holds the instructions for connecting an agent.
 * It opens on Setup until a database is turned on, and on Databases after
 * that, or whenever it is opened at one database.
 */
const DesktopAgentPage = observer(() => {
  const { global } = useStores();
  const anyOn = global.connections.some(c => c.mcpEnabled);
  const [tab, setTab] = useState<'databases' | 'masking' | 'setup'>(
    anyOn || global.agentDatabaseFocus ? 'databases' : 'setup',
  );
  // The page stays mounted while Settings is closed (SettingsDock), so a
  // request to open it at one database arrives here as a change.
  const [focus, setFocus] = useState<{ connectionId: string; ruleId?: string } | null>(null);
  const requested = global.agentDatabaseFocus;
  useEffect(() => {
    if (!requested) return;
    setTab('databases');
    setFocus(requested);
    global.clearAgentDatabaseFocus();
  }, [requested, global]);
  const clearFocus = useCallback(() => setFocus(null), []);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Tabs
        value={tab}
        onChange={(_e, v) => setTab(v)}
        sx={{ flexShrink: 0, mb: 2, minHeight: 36 }}
      >
        <Tab label="Databases" value="databases" sx={{ minHeight: 36, textTransform: 'none' }} />
        <Tab label="Masking" value="masking" sx={{ minHeight: 36, textTransform: 'none' }} />
        <Tab label="Setup" value="setup" sx={{ minHeight: 36, textTransform: 'none' }} />
      </Tabs>
      {/* The scrollbar's room is kept even when nothing overflows, so
          opening a database doesn't shift the rows sideways. */}
      <Box
        className="styled-scrollbar"
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollbarGutter: 'stable', pr: 1 }}
      >
        {tab === 'databases' && <AgentDatabases focus={focus} onFocused={clearFocus} />}
        {tab === 'masking' && <MaskingRuleSets />}
        {tab === 'setup' && <SetupInstructions onDone={() => setTab('databases')} />}
      </Box>
    </Box>
  );
});

/**
 * Rail entry is always visible, even on web/playground builds, so the
 * feature is discoverable rather than silently absent -- this is the
 * content shown there instead of real instructions. No download link:
 * deliberately not guessing at a URL that isn't confirmed here.
 */
const WebMcpNotice = () => (
  <Box sx={{ opacity: 0.75 }}>
    <Typography variant="body2" sx={{ color: 'var(--text-color)', mb: 1 }}>
      MCP lets an AI agent (like Claude Code) run queries against your connections directly, from
      its own tool calls.
    </Typography>
    <Typography variant="body2" color="text.secondary">
      Available in the desktop app.
    </Typography>
  </Box>
);

const McpSection = () => (
  <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    {/* Right padding keeps the title clear of the panel's close button. */}
    <Box
      sx={{
        flexShrink: 0,
        mb: 1,
        pr: 5,
        display: 'flex',
        alignItems: 'baseline',
        gap: 1,
        flexWrap: 'wrap',
      }}
    >
      <Typography variant="h6" component="h2" sx={{ color: 'var(--text-color)' }}>
        Agent
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Experimental: setup and behavior may change.
      </Typography>
    </Box>
    <Box sx={{ flex: 1, minHeight: 0 }}>
      {isDesktop() ? <DesktopAgentPage /> : <WebMcpNotice />}
    </Box>
  </Box>
);

export default McpSection;
