import { useEffect, useRef, useState } from 'react';
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
import { agentAccessOf, type AgentAccess, type ConnectionInfo } from '../../store/client';
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
 * Shows how to register this install as an MCP server -- deliberately just
 * instructions, not a button that writes into an agent's config file
 * itself. Registration is the agent's own concern (its own config format,
 * its own consent flow); a third-party app silently editing that file would
 * cross a trust boundary that isn't this app's to cross. See
 * beamlynx-plans/completed/2026-08-15-mcp-server-and-url-scheme.md.
 */
const DesktopMcpInstructions = () => {
  const [setupInfo, setSetupInfo] = useState<{ name: string; command: string; args: string[] } | null>(null);
  const [tab, setTab] = useState<'claude' | 'json'>('claude');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return;
    window.beamlynxDesktop.mcp.getSetupInfo().then(setSetupInfo);
  }, []);

  const claudeCodeCommand = setupInfo
    ? [
        `claude mcp add ${setupInfo.name} -- \\`,
        `    "${setupInfo.command}" \\`,
        ...setupInfo.args.map((arg, i) => (i === setupInfo.args.length - 1 ? `    ${arg}` : `    ${arg} \\`)),
      ].join('\n')
    : 'Loading…';

  const manualJson = setupInfo
    ? JSON.stringify(
        { mcpServers: { [setupInfo.name]: { type: 'stdio', command: setupInfo.command, args: setupInfo.args } } },
        null,
        2,
      )
    : 'Loading…';

  return (
    <Box>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2, minHeight: 36 }}>
        <Tab label="Claude" value="claude" sx={{ minHeight: 36 }} />
        <Tab label="JSON" value="json" sx={{ minHeight: 36 }} />
      </Tabs>

      {tab === 'claude' ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Run in a terminal:
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          This is the <code>mcpServers</code> shape most MCP clients use -- paste it into your client&apos;s config
          (e.g. Claude Code&apos;s <code>.mcp.json</code>, Claude Desktop&apos;s{' '}
          <code>claude_desktop_config.json</code>):
        </Typography>
      )}

      {/* A long command or JSON snippet scrolls inside its own box, so the
          databases below stay in reach. */}
      <Box className="styled-scrollbar" sx={{ maxHeight: 220, overflowY: 'auto' }}>
        <CopyBlock text={tab === 'claude' ? claudeCodeCommand : manualJson} />
      </Box>
    </Box>
  );
};

// A heading inside the Agent page, optionally folding what is under it.
const PartHeading = ({
  title,
  open,
  onToggle,
}: {
  title: string;
  open?: boolean;
  onToggle?: () => void;
}) => (
  <Box
    component={onToggle ? 'button' : 'div'}
    onClick={onToggle}
    aria-expanded={onToggle ? open : undefined}
    sx={{
      all: 'unset',
      display: 'flex',
      alignItems: 'center',
      gap: 0.5,
      mb: 1,
      cursor: onToggle ? 'pointer' : 'default',
      color: 'var(--text-color)',
      '&:focus-visible': { outline: '2px solid var(--primary-color)', outlineOffset: 2 },
    }}
  >
    {onToggle && (
      <ExpandMoreIcon
        sx={{ fontSize: 18, transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 150ms' }}
      />
    )}
    <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600 }}>
      {title}
    </Typography>
  </Box>
);

// Every action that is a text button, as in ConnectionsSection.tsx.
const actionSx = { textTransform: 'none', color: 'var(--primary-color)', px: 0.75, fontSize: 13 } as const;
const actionIconSx = { fontSize: 16 } as const;

/**
 * One database on the Agent page: whether agents can use it (Off, Masked,
 * Every column), and, when masked, its data masking.
 *
 * Turning a database on masks it with the recommended rules straight away:
 * the safe choice needs no question. Every column asks first, since it
 * weakens protection. "Start over from" replaces the rules with a copy of
 * the recommended ones or of another database's.
 *
 * The rules underneath are a policy copied from a template (GlobalStore.
 * policyTemplates). The word "template" stays out of the UI: people think
 * "the recommended rules" or "the same as my other database".
 */
const AgentDatabaseRow = observer(({ connection }: { connection: ConnectionInfo }) => {
  const { global } = useStores();
  const { id, label, applyPolicyToOwnQueries } = connection;
  const ownPolicy = global.connectionPolicy(id);
  const rulesOn = ownPolicy?.rules.filter(m => m.enabled).length ?? 0;
  const access = agentAccessOf(connection);
  const [asking, setAsking] = useState<'every-column' | 'start-over' | null>(null);
  const [startFrom, setStartFrom] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [focusedRuleId, setFocusedRuleId] = useState<string | undefined>();
  const rowRef = useRef<HTMLDivElement>(null);

  // Opened at this database (openAgentDatabase): from the results grid,
  // or its robot under Database Connections. Show its rules, with the one
  // asked about picked out.
  const focus = global.agentDatabaseFocus;
  useEffect(() => {
    if (!focus || focus.connectionId !== id) return;
    if (ownPolicy) setShowRules(true);
    setFocusedRuleId(focus.ruleId);
    rowRef.current?.scrollIntoView({ block: 'nearest' });
    global.clearAgentDatabaseFocus();
  }, [focus, id, ownPolicy, global]);

  const recommendedId = global.policyTemplates.find(t => t.builtIn)?.id ?? global.policyTemplates[0]?.id ?? '';
  // What the rules can start over from: the recommended ones, then each
  // other database with a rule on, then rules saved by name in an older
  // version of the app.
  const otherDatabases = global.connections.filter(c => {
    if (c.id === id) return false;
    return !!global.connectionPolicy(c.id)?.rules.some(m => m.enabled);
  });
  const savedRules = global.policyTemplates.filter(t => !t.builtIn);

  const chooseAccess = (next: AgentAccess | null) => {
    if (!next || next === access) return;
    if (next === 'every-column') return setAsking('every-column');
    void global.setAgentAccess(id, next, next === 'masked' && !ownPolicy ? recommendedId : undefined);
  };

  const startOver = () => {
    setStartFrom(`template:${recommendedId}`);
    setAsking('start-over');
  };
  const applyStartOver = async () => {
    const [kind, sourceId] = [startFrom.slice(0, startFrom.indexOf(':')), startFrom.slice(startFrom.indexOf(':') + 1)];
    if (kind === 'database') await global.copyPolicyFrom(id, sourceId);
    else await global.attachTemplate(id, sourceId);
  };

  return (
    <Box ref={rowRef} sx={{ py: 1.5, borderBottom: '1px solid var(--border-color)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            flexShrink: 0,
            backgroundColor: global.getConnectionColor(id) || 'var(--border-color)',
          }}
        />
        <Typography
          variant="body2"
          title={label}
          sx={{
            flex: 1,
            minWidth: 80,
            fontFamily: 'var(--canvas-font)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--text-color)',
          }}
        >
          {label}
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={access}
          onChange={(_e, next) => chooseAccess(next)}
          aria-label={`What agents can do on ${label}`}
          sx={{
            '& .MuiToggleButton-root': { textTransform: 'none', px: 1.25, py: 0.125, fontSize: 13 },
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
      </Box>

      {access === 'masked' && ownPolicy && (
        <Box sx={{ pl: 2, mt: 1 }}>
          <Typography variant="body2" sx={{ color: 'var(--canvas-text-dim)' }}>
            {rulesOn === 0
              ? 'Data masking: no rule is on, so nothing is masked. Turn a rule on.'
              : `Data masking: ${rulesOn} rule${rulesOn === 1 ? '' : 's'} on.`}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5, ml: -0.75 }}>
            <Button
              size="small"
              startIcon={
                <ExpandMoreIcon
                  sx={{ fontSize: 18, transform: showRules ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
                />
              }
              onClick={() => setShowRules(!showRules)}
              aria-expanded={showRules}
              sx={actionSx}
            >
              {showRules ? 'Hide rules' : 'Edit rules'}
            </Button>
            <Button size="small" onClick={startOver} startIcon={<RestartAltIcon sx={actionIconSx} />} sx={actionSx}>
              Start over from…
            </Button>
          </Box>
          {showRules && (
            <Box sx={{ mt: 1.5 }}>
              <PolicyRules policy={ownPolicy} focusedRuleId={focusedRuleId} />
            </Box>
          )}
          <ToggleRow
            label="Mask my own queries too"
            description="See what agents see: data masking applies to your own queries on this database as well."
            descriptionInTooltip
            divider={false}
            checked={!!applyPolicyToOwnQueries}
            onChange={value => global.setApplyPolicyToOwnQueries(id, value)}
          />
        </Box>
      )}

      {access === 'every-column' && (
        <Alert severity="warning" sx={{ mt: 1, py: 0.25, '& .MuiAlert-message': { fontSize: 13 } }}>
          Agents read every column of this database, unmasked.
        </Alert>
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
          Its {ownPolicy?.rules.length ?? 0} rules are replaced by a copy of the ones you pick, including any rule you
          added. No other database changes.
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
          <MenuItem value={`template:${recommendedId}`}>Recommended</MenuItem>
          {otherDatabases.map(c => (
            <MenuItem key={c.id} value={`database:${c.id}`}>
              Same as {c.label}
            </MenuItem>
          ))}
          {savedRules.map(t => (
            <MenuItem key={t.id} value={`template:${t.id}`} disabled={!t.rules.some(m => m.enabled)}>
              {t.name}
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
          Agents on {label} will read every column of this database, unmasked, including any column data masking hides
          today. Nothing here will limit what they see.
        </p>
        {ownPolicy && <p>Its data masking rules are kept. Switch back to Masked to apply them again.</p>}
      </ConfirmDialog>
    </Box>
  );
});

/**
 * The Agent page's second part: which saved databases agents can use, and
 * each one's data masking. Every database starts Off. Adding a database
 * asks nothing about agents.
 */
const AgentDatabases = observer(() => {
  const { global } = useStores();
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <PartHeading title="Databases your agent can use" />
        <Box sx={{ mb: 1 }}>
          <InfoHint
            text={
              <>
                <b>Off:</b> agents can&apos;t use this database.
                <br />
                <b>Masked:</b> data masking hides columns that may hold personal or secret data. They come back as
                xxxxx. Agents can still filter and join on them.
                <br />
                <b>Every column:</b> agents read every column, unmasked.
              </>
            }
          />
        </Box>
      </Box>
      {global.connections.length === 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            No databases yet.
          </Typography>
          <Button size="small" onClick={() => global.openAddConnection()} sx={actionSx}>
            Add a database
          </Button>
        </Box>
      ) : (
        <Box sx={{ borderTop: '1px solid var(--border-color)' }}>
          {global.connections.map(c => (
            <AgentDatabaseRow key={c.id} connection={c} />
          ))}
        </Box>
      )}
    </Box>
  );
});

/**
 * The desktop Agent page: connect an agent, then choose the databases it
 * can use. Connecting folds away once a database is on, since by then the
 * agent is usually set up; opening the page at one database folds it too.
 */
const DesktopAgentPage = observer(() => {
  const { global } = useStores();
  const anyOn = global.connections.some(c => c.mcpEnabled);
  const [connectOpen, setConnectOpen] = useState(!anyOn && !global.agentDatabaseFocus);
  return (
    <Box className="styled-scrollbar" sx={{ height: '100%', overflowY: 'auto', pr: 1 }}>
      <Box sx={{ mb: 3 }}>
        <PartHeading title="Connect your agent" open={connectOpen} onToggle={() => setConnectOpen(!connectOpen)} />
        {connectOpen && <DesktopMcpInstructions />}
      </Box>
      <AgentDatabases />
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
      MCP lets an AI agent (like Claude Code) run queries against your connections directly, from its own tool
      calls.
    </Typography>
    <Typography variant="body2" color="text.secondary">
      Available in the desktop app.
    </Typography>
  </Box>
);

const McpSection = () => (
  <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <Box
      sx={{
        flexShrink: 0,
        pb: 1.5,
        mb: 2,
        borderBottom: '1px solid var(--border-color)',
      }}
    >
      <Typography variant="h6" component="h2" gutterBottom sx={{ color: 'var(--text-color)' }}>
        Agent
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Experimental -- setup and behavior may change.
      </Typography>
    </Box>
    <Box sx={{ flex: 1, minHeight: 0 }}>{isDesktop() ? <DesktopAgentPage /> : <WebMcpNotice />}</Box>
  </Box>
);

export default McpSection;
