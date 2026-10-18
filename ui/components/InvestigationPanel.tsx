import { useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, IconButton, TextField, Typography } from '@mui/material';
import {
  ArrowDownward,
  ChevronLeft,
  ChevronRight,
  CheckCircleOutline,
  ErrorOutline,
  LightbulbOutlined,
  Send,
  VisibilityOutlined,
} from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import type { Investigation, InvestigationStep } from '../store/investigations';
import { columnName } from '../utils/accessPolicy';

/**
 * The timeline of an agent's investigation (store/investigations.ts), beside
 * its canvas and results: every step it took and what it saw, the decisions
 * it is waiting on, and a box to write to it.
 *
 * Clicking a query shows its result again, without running anything. The
 * tab follows the newest query until you pick an older one.
 */

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

const dim = 'var(--canvas-text-dim)';
const failed = 'var(--canvas-trace-unresolved)';

const QueryStep = observer(
  ({ investigation, step }: { investigation: Investigation; step: Extract<InvestigationStep, { kind: 'query' }> }) => {
    const { global } = useStores();
    const selected =
      investigation.selectedStepId === step.id ||
      (investigation.selectedStepId === null && investigation.latestQuery?.id === step.id);
    // The reason is shown above; the Pine without its leading comment.
    const pine = step.expression.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '').replace(/^\s*--.*\n/, '').trim();
    return (
      <Box
        role="button"
        tabIndex={0}
        onClick={() => step.snapshot && global.showInvestigationStep(investigation.id, step.id)}
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ' ') && step.snapshot) {
            e.preventDefault();
            global.showInvestigationStep(investigation.id, step.id);
          }
        }}
        sx={{
          border: '1px solid',
          borderColor: selected ? 'var(--canvas-trace)' : 'var(--border-color)',
          borderRadius: 1,
          px: 1.25,
          py: 1,
          cursor: step.snapshot ? 'pointer' : 'default',
          backgroundColor: selected ? 'var(--canvas-chip-bg)' : 'transparent',
          '&:hover': { backgroundColor: 'var(--canvas-chip-bg)' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: dim, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {step.by === 'user' ? 'You ran' : 'Query'}
          </Typography>
          <Box sx={{ flex: 1 }} />
          {step.running ? (
            <CircularProgress size={11} thickness={6} sx={{ color: 'var(--canvas-trace)' }} />
          ) : step.error ? (
            <Typography sx={{ fontSize: 12, color: failed, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <ErrorOutline sx={{ fontSize: 14 }} /> Failed
            </Typography>
          ) : (
            <Typography sx={{ fontSize: 12, color: dim }}>
              {step.rowCount} row{step.rowCount === 1 ? '' : 's'}
            </Typography>
          )}
        </Box>
        {step.reason && (
          <Typography sx={{ fontSize: 13, color: 'var(--text-color)', mb: 0.5, lineHeight: 1.4 }}>{step.reason}</Typography>
        )}
        <Box
          component="pre"
          sx={{
            m: 0,
            fontFamily: 'var(--code-font)',
            fontSize: 12,
            color: dim,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {pine}
        </Box>
        {step.error && (
          <Typography
            sx={{
              fontSize: 12,
              color: failed,
              mt: 0.5,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {step.error}
          </Typography>
        )}
      </Box>
    );
  },
);

const ApprovalStep = observer(
  ({ investigation, step }: { investigation: Investigation; step: Extract<InvestigationStep, { kind: 'approval' }> }) => {
    const { global } = useStores();
    const [declining, setDeclining] = useState(false);
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const table = step.column.table;
    const name = table
      ? columnName({ schema: table.schema, table: table.table, column: step.column.column })
      : step.column.column;

    const answer = async (allowed: boolean, inCopy = false) => {
      setBusy(true);
      setError('');
      const ok = await global.answerApproval(
        investigation.id,
        step.approvalId,
        allowed,
        comment.trim() || undefined,
        inCopy,
      );
      setBusy(false);
      if (!ok) setError("Couldn't save that to the access policy.");
    };

    const pending = step.status === 'pending';
    const policy = global.investigationPolicy(investigation.id);
    // A policy other connections use too: Allow changes what their agents
    // see as well, so a copy for this connection alone is offered first.
    const shared = !!policy && policy.others.length > 0;
    const where = !policy
      ? undefined
      : shared
        ? `“${policy.name}” is also used by ${policy.others.join(', ')}. Allowing it there changes what agents see on ${policy.others.length === 1 ? 'it' : 'them'} too. A copy for ${policy.connection} changes only ${policy.connection}.`
        : `Adds it to the Allow rules of the “${policy.name}” policy.`;
    return (
      <Box
        sx={{
          border: '1px solid',
          borderColor: pending ? 'var(--notification-color)' : 'var(--border-color)',
          borderRadius: 1,
          px: 1.25,
          py: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
          <VisibilityOutlined sx={{ fontSize: 16, color: pending ? 'var(--notification-color)' : dim }} />
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--text-color)' }}>
            The agent needs to see <Box component="code" sx={{ fontFamily: 'var(--code-font)' }}>{name}</Box>
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 12, color: dim, mb: 1, lineHeight: 1.4 }}>
          Your access policy hides it, and the agent&apos;s query uses it.
          {step.reason ? ` Its reason: “${step.reason}”` : ''}
        </Typography>
        {!pending ? (
          <Typography sx={{ fontSize: 12, color: dim, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CheckCircleOutline sx={{ fontSize: 14 }} />
            {step.status === 'allowed'
              ? 'Allowed. The query ran again.'
              : step.status === 'expired'
                ? 'The agent stopped waiting for an answer.'
                : 'Declined.'}
          </Typography>
        ) : declining ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <TextField
              size="small"
              autoFocus
              placeholder="Why not? Optional, but it helps the agent."
              value={comment}
              onChange={e => setComment(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !busy) {
                  e.preventDefault();
                  void answer(false);
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  setDeclining(false);
                }
              }}
              sx={{ '& .MuiInputBase-input': { fontSize: 13 } }}
            />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" disabled={busy} onClick={() => setDeclining(false)}>
                Cancel
              </Button>
              <Button size="small" color="error" disabled={busy} onClick={() => answer(false)}>
                Decline
              </Button>
            </Box>
          </Box>
        ) : (
          <>
            {where && <Typography sx={{ fontSize: 12, color: dim, mb: 1, lineHeight: 1.4 }}>{where}</Typography>}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {shared ? (
                <>
                  <Button size="small" variant="contained" disabled={busy} onClick={() => answer(true, true)}>
                    Allow in a copy for {policy!.connection}
                  </Button>
                  <Button size="small" disabled={busy} onClick={() => answer(true)}>
                    Allow in “{policy!.name}”
                  </Button>
                </>
              ) : (
                <Button size="small" variant="contained" disabled={busy} onClick={() => answer(true)}>
                  Allow
                </Button>
              )}
              <Button size="small" color="error" disabled={busy} onClick={() => setDeclining(true)}>
                Decline…
              </Button>
            </Box>
          </>
        )}
        {error && <Typography sx={{ fontSize: 12, color: failed, mt: 0.5 }}>{error}</Typography>}
      </Box>
    );
  },
);

const RevealStep = observer(
  ({ investigation, step }: { investigation: Investigation; step: Extract<InvestigationStep, { kind: 'reveal' }> }) => {
    const { global } = useStores();
    const [declining, setDeclining] = useState(false);
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const pending = step.status === 'pending';
    const shown = investigation.selectedStepId === step.id;
    const rows = step.preview?.rows.length ?? 0;
    const pine = step.expression.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '').trim();

    const answer = async (reveal: boolean) => {
      setBusy(true);
      await global.answerReveal(investigation.id, step.requestId, reveal, comment.trim() || undefined);
      setBusy(false);
    };

    return (
      <Box
        sx={{
          border: '1px solid',
          borderColor: pending || step.status === 'running' ? 'var(--notification-color)' : 'var(--border-color)',
          borderRadius: 1,
          px: 1.25,
          py: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
          <VisibilityOutlined sx={{ fontSize: 16, color: pending ? 'var(--notification-color)' : dim }} />
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--text-color)' }}>
            The agent asks to see the real values
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 12, color: dim, mb: 0.5, lineHeight: 1.4 }}>
          Your access policy masks some of what this query returns.
          {step.reason ? ` Its reason: “${step.reason}”` : ''}
        </Typography>
        <Box
          component="pre"
          sx={{
            m: 0,
            mb: 1,
            fontFamily: 'var(--code-font)',
            fontSize: 12,
            color: dim,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {pine}
        </Box>
        {step.status === 'running' && (
          <Typography sx={{ fontSize: 12, color: dim, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <CircularProgress size={11} thickness={6} sx={{ color: 'var(--canvas-trace)' }} />
            Running it, so you can look first…
          </Typography>
        )}
        {(step.status === 'revealed' || step.status === 'declined') && (
          <Typography sx={{ fontSize: 12, color: dim, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CheckCircleOutline sx={{ fontSize: 14 }} />
            {step.status === 'revealed' ? `Revealed: the agent has these ${rows} rows.` : step.note ?? 'Declined.'}
          </Typography>
        )}
        {pending && (
          <>
            <Button
              size="small"
              onClick={() =>
                global.showInvestigationStep(investigation.id, shown ? null : step.id)
              }
              sx={{ mb: 1, px: 0, textTransform: 'none' }}
            >
              {shown ? 'Back to the latest' : `Look at the ${rows} row${rows === 1 ? '' : 's'} first`}
            </Button>
            {declining ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <TextField
                  size="small"
                  autoFocus
                  placeholder="Why not? Optional, but it helps the agent."
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === 'Enter' && !busy) {
                      e.preventDefault();
                      void answer(false);
                    } else if (e.key === 'Escape') {
                      setDeclining(false);
                    }
                  }}
                  sx={{ '& .MuiInputBase-input': { fontSize: 13 } }}
                />
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  <Button size="small" disabled={busy} onClick={() => setDeclining(false)}>
                    Cancel
                  </Button>
                  <Button size="small" color="error" disabled={busy} onClick={() => answer(false)}>
                    Decline
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="contained" disabled={busy} onClick={() => answer(true)}>
                  Reveal to the agent
                </Button>
                <Button size="small" color="error" disabled={busy} onClick={() => setDeclining(true)}>
                  Decline…
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>
    );
  },
);

const Step = observer(({ investigation, step }: { investigation: Investigation; step: InvestigationStep }) => {
  switch (step.kind) {
    case 'reveal':
      return <RevealStep investigation={investigation} step={step} />;
    case 'query':
      return <QueryStep investigation={investigation} step={step} />;
    case 'approval':
      return <ApprovalStep investigation={investigation} step={step} />;
    case 'finding':
      return (
        <Box sx={{ display: 'flex', gap: 0.75, px: 0.25 }}>
          <LightbulbOutlined sx={{ fontSize: 16, color: 'var(--notification-color)', mt: '2px' }} />
          <Typography sx={{ fontSize: 13, color: 'var(--text-color)', lineHeight: 1.45 }}>{step.text}</Typography>
        </Box>
      );
    case 'note':
      return (
        <Box sx={{ alignSelf: 'flex-end', maxWidth: '88%' }}>
          <Box
            sx={{
              px: 1.25,
              py: 0.75,
              borderRadius: 1,
              backgroundColor: 'var(--canvas-chip-bg)',
              fontSize: 13,
              color: 'var(--text-color)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {step.text}
          </Box>
          <Typography sx={{ fontSize: 11, color: dim, textAlign: 'right', mt: 0.25 }}>
            {step.delivered ? 'The agent has it' : 'Waiting for the agent’s next call'}
          </Typography>
        </Box>
      );
    case 'call':
      return (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, px: 0.25 }}>
          <Typography
            sx={{
              fontSize: 12,
              color: step.ok === false ? failed : dim,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={step.ok === false && step.outcome ? step.outcome : step.detail}
          >
            {step.endedAt === undefined ? '… ' : ''}
            {step.summary}
            {step.ok === false ? ': failed' : ''}
          </Typography>
        </Box>
      );
  }
});

const NoteComposer = observer(({ investigation }: { investigation: Investigation }) => {
  const { global } = useStores();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setError('');
    const ok = await global.sendInvestigationNote(investigation.id, text);
    setSending(false);
    if (ok) setText('');
    else setError("Couldn't send it. Is the desktop app up to date?");
  };
  return (
    <Box sx={{ borderTop: '1px solid var(--border-color)', p: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.75 }}>
        <TextField
          multiline
          maxRows={6}
          fullWidth
          size="small"
          placeholder="Tell the agent…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            // Enter sends; Shift+Enter is a new line. Kept from reaching the
            // app's own keybindings while typing here.
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          sx={{ '& .MuiInputBase-input': { fontSize: 13 } }}
          inputProps={{ 'aria-label': 'Tell the agent' }}
        />
        <IconButton size="small" onClick={send} disabled={!text.trim() || sending} aria-label="Send to the agent">
          <Send sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
      <Typography sx={{ fontSize: 11, color: error ? failed : dim, mt: 0.5 }}>
        {error || 'Arrives with the agent’s next call to beamlynx.'}
      </Typography>
    </Box>
  );
});

const InvestigationPanel = observer(({ investigation }: { investigation: Investigation }) => {
  const { global } = useStores();
  const activity = global.agentActivity;
  const [now, setNow] = useState(Date.now());
  const list = useRef<HTMLDivElement>(null);

  // "Last call 40 s ago" has to move on its own.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  // Keep the newest step in view while following, and always bring a note
  // the user just sent into view.
  const count = investigation.steps.length;
  const lastIsNote = investigation.steps.at(-1)?.kind === 'note';
  useEffect(() => {
    if ((investigation.selectedStepId === null || lastIsNote) && list.current) {
      list.current.scrollTop = list.current.scrollHeight;
    }
  }, [count, investigation.selectedStepId, lastIsNote]);

  // The activity feed is shared: it says what the agent of the latest
  // investigation is doing, so only that investigation's tab shows it.
  const working = activity.working && activity.current && global.mcpSessionId === investigation.sessionId;
  // After a pause, say why it may be quiet: the agent also uses other
  // tools, which beamlynx can't see.
  const sinceLastCall = investigation.lastCallAt ? now - investigation.lastCallAt : undefined;
  const status = working
    ? activity.current!.summary
    : sinceLastCall === undefined
      ? 'Waiting for the agent'
      : sinceLastCall < 15000
        ? 'Last call just now'
        : `Last call ${ago(sinceLastCall)}. The agent may be working in another tool.`;

  if (global.investigationPanelCollapsed) {
    const waiting = investigation.pendingDecisions.length > 0;
    return (
      <Box
        sx={{
          width: 36,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pt: 1,
          borderRight: '1px solid var(--border-color)',
          backgroundColor: 'var(--background-color)',
        }}
        data-testid="investigation-panel"
      >
        <IconButton
          size="small"
          onClick={() => global.setInvestigationPanelCollapsed(false)}
          aria-label={waiting ? 'Show the timeline: the agent is waiting for your answer' : 'Show the timeline'}
          title={waiting ? 'The agent is waiting for your answer' : 'Show the timeline'}
          sx={{ color: waiting ? 'var(--notification-color)' : dim }}
        >
          <ChevronRight sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: 340,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        borderRight: '1px solid var(--border-color)',
        backgroundColor: 'var(--background-color)',
      }}
      data-testid="investigation-panel"
    >
      <Box sx={{ px: 1.5, pt: 1.25, pb: 1, borderBottom: '1px solid var(--border-color)' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
          <Typography
            component="h2"
            sx={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text-color)', lineHeight: 1.35 }}
          >
            {investigation.question ?? 'Agent investigation'}
          </Typography>
          <IconButton
            size="small"
            onClick={() => global.setInvestigationPanelCollapsed(true)}
            aria-label="Hide the timeline"
            title="Hide the timeline"
            sx={{ color: dim, mt: '-2px', mr: '-6px' }}
          >
            <ChevronLeft sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
        <Typography sx={{ fontSize: 12, color: working ? 'var(--canvas-trace)' : dim, mt: 0.25 }}>{status}</Typography>
      </Box>

      <Box
        ref={list}
        className="styled-scrollbar"
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1.25, display: 'flex', flexDirection: 'column', gap: 1 }}
      >
        {investigation.steps.length === 0 && (
          <Typography sx={{ fontSize: 13, color: dim }}>
            Each step the agent takes here shows up as it happens, with what it saw.
          </Typography>
        )}
        {investigation.steps.map(step => (
          <Step key={step.id} investigation={investigation} step={step} />
        ))}
      </Box>

      {investigation.selectedStepId !== null && (
        <Box sx={{ px: 1.25, pb: 0.75, display: 'flex', justifyContent: 'center' }}>
          <Button
            size="small"
            startIcon={<ArrowDownward sx={{ fontSize: 16 }} />}
            onClick={() => global.showInvestigationStep(investigation.id, null)}
          >
            Back to the latest
          </Button>
        </Box>
      )}

      <NoteComposer investigation={investigation} />
    </Box>
  );
});

export default InvestigationPanel;
