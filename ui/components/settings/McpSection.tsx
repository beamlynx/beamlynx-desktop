import { useEffect, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import { Box, Button, Tab, Tabs, TextField, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { isDesktop } from '../../store/util';
import { useStores } from '../../store/store-container';
import ConfirmDialog from '../ConfirmDialog';
import InfoHint from '../InfoHint';
import { PolicyRules } from './DataMaskingRules';
import { ruleSetName } from './AgentAccessSettings';

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
 * Which databases agents can use, as one line and a link to Database
 * Connections, where each one is turned on. Not a list: the databases are
 * listed in one place only.
 */
const DatabasesForAgents = observer(() => {
  const { global } = useStores();
  const total = global.connections.length;
  const on = global.connections.filter(c => c.mcpEnabled).length;
  const open = () => {
    const first = global.connections[0];
    // With one database, open it, so its switch is right there.
    if (total === 1 && first) global.openAgentDatabase(first.id);
    else global.setShowSettings(true, 'connections');
  };
  const text =
    total === 0
      ? 'No databases yet.'
      : on === 0
        ? "Agents can't use any database yet. Turn them on for a database in Database Connections."
        : `Agents can use ${on} of your ${total} database${total === 1 ? '' : 's'}. Change it in Database Connections.`;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Typography
        variant="body2"
        sx={{ color: on === 0 && total > 0 ? 'var(--text-warning-color)' : 'var(--text-color)' }}
      >
        {text}
      </Typography>
      {total === 0 ? (
        <Button size="small" onClick={() => global.openAddConnection()} sx={actionSx}>
          Add a database
        </Button>
      ) : (
        <Button size="small" onClick={open} sx={actionSx}>
          Choose databases
        </Button>
      )}
    </Box>
  );
});

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
const SetupInstructions = () => {
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
          1. Connect your agent
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          For Claude Code, run this in a terminal:
        </Typography>
        <CopyBlock text={claudeCodeCommand} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
          For other MCP clients, paste this into the client&apos;s MCP config, such as Claude
          Desktop&apos;s <code>claude_desktop_config.json</code>:
        </Typography>
        <CopyBlock text={manualJson} />
      </Box>
      <Box>
        <Typography variant="subtitle2" component="h3" sx={headingSx}>
          2. Choose the databases it can use
        </Typography>
        <DatabasesForAgents />
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
          The rules a database&apos;s masking starts from. Turning agents on for a database uses
          Recommended. To use another set, open the database in Database Connections and pick
          Start over from… there.
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
 * The desktop Agent page: two tabs. Setup connects an agent and says which
 * databases it can use; Masking holds the rule sets a database's masking
 * starts from.
 *
 * Which databases agents can use, and how each is masked, is set on the
 * database itself in Database Connections (AgentAccessSettings), not here:
 * the app lists its databases in one place.
 */
const DesktopAgentPage = () => {
  const [tab, setTab] = useState<'setup' | 'masking'>('setup');

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Tabs
        value={tab}
        onChange={(_e, v) => setTab(v)}
        sx={{ flexShrink: 0, mb: 2, minHeight: 36 }}
      >
        <Tab label="Setup" value="setup" sx={{ minHeight: 36, textTransform: 'none' }} />
        <Tab label="Masking" value="masking" sx={{ minHeight: 36, textTransform: 'none' }} />
      </Tabs>
      <Box
        className="styled-scrollbar"
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollbarGutter: 'stable', pr: 1 }}
      >
        {tab === 'setup' && <SetupInstructions />}
        {tab === 'masking' && <MaskingRuleSets />}
      </Box>
    </Box>
  );
};

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
