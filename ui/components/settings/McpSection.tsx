import { useEffect, useState } from 'react';
import { Box, Button, Tab, Tabs, Typography } from '@mui/material';
import { isDesktop } from '../../store/util';

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
        fontSize: '0.8rem',
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
 * beamlynx-plans/pending/2026-08-15-mcp-server-and-url-scheme.md.
 */
const DesktopMcpInstructions = () => {
  const [setupInfo, setSetupInfo] = useState<{ command: string; args: string[] } | null>(null);
  const [tab, setTab] = useState<'claude' | 'json'>('claude');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return;
    window.beamlynxDesktop.mcp.getSetupInfo().then(setSetupInfo);
  }, []);

  const claudeCodeCommand = setupInfo
    ? [
        'claude mcp add beamlynx -- \\',
        `    "${setupInfo.command}" \\`,
        ...setupInfo.args.map((arg, i) => (i === setupInfo.args.length - 1 ? `    ${arg}` : `    ${arg} \\`)),
      ].join('\n')
    : 'Loading…';

  const manualJson = setupInfo
    ? JSON.stringify(
        { mcpServers: { beamlynx: { type: 'stdio', command: setupInfo.command, args: setupInfo.args } } },
        null,
        2,
      )
    : 'Loading…';

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ flexShrink: 0, mb: 2, minHeight: 36 }}>
        <Tab label="Claude" value="claude" sx={{ minHeight: 36 }} />
        <Tab label="JSON" value="json" sx={{ minHeight: 36 }} />
      </Tabs>

      {tab === 'claude' ? (
        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, mb: 1.5 }}>
          Run in a terminal:
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, mb: 1.5 }}>
          This is the <code>mcpServers</code> shape most MCP clients use -- paste it into your client&apos;s config
          (e.g. Claude Code&apos;s <code>.mcp.json</code>, Claude Desktop&apos;s{' '}
          <code>claude_desktop_config.json</code>):
        </Typography>
      )}

      {/* Only this code viewer scrolls -- the tabs, description above, and
          the note below all stay put regardless of how long the command or
          JSON snippet is. */}
      <Box className="styled-scrollbar" sx={{ flex: 1, minHeight: 60, overflowY: 'auto' }}>
        <CopyBlock text={tab === 'claude' ? claudeCodeCommand : manualJson} />
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, display: 'block', mt: 2 }}>
        Then toggle &quot;Enable for MCP access&quot; on a connection under Connections to let it be used.
      </Typography>
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
        MCP
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Experimental -- setup and behavior may change.
      </Typography>
    </Box>
    <Box sx={{ flex: 1, minHeight: 0 }}>{isDesktop() ? <DesktopMcpInstructions /> : <WebMcpNotice />}</Box>
  </Box>
);

export default McpSection;
