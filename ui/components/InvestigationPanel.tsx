import { useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, IconButton, TextField, Typography } from '@mui/material';
import {
  ArrowDownward,
  ChevronLeft,
  ChevronRight,
  CheckCircleOutline,
  ErrorOutline,
  LightbulbOutlined,
  PolicyOutlined,
  Send,
  VisibilityOutlined,
} from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import type { Investigation, InvestigationStep } from '../store/investigations';
import { describeMatcher, ownHideRules } from '../utils/accessPolicy';
import type { AccessPolicyModule, AccessPolicyRule } from '../store/client';
import type { PolicyChange } from '../desktop';

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

// One line of text, cut with an ellipsis. The whole text is in its tooltip.
const oneLine = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

/**
 * A query as two short lines: why the agent ran it and how it went, then
 * the query itself. Without a reason the query is the first line.
 */
const QueryStep = observer(
  ({ investigation, step }: { investigation: Investigation; step: Extract<InvestigationStep, { kind: 'query' }> }) => {
    const { global } = useStores();
    const selected =
      investigation.selectedStepId === step.id ||
      (investigation.selectedStepId === null && investigation.latestQuery?.id === step.id);
    // The query without its leading comment, which is the reason. An
    // agent's SQL is shown, marked as SQL, only until it is Pine, or when it
    // never became Pine.
    const asSql = !step.expression && step.sql !== undefined;
    const query = (asSql ? step.sql! : step.expression)
      .replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '')
      .replace(/^\s*--.*\n/, '')
      .replace(/\s+/g, ' ')
      .trim();
    const prefix = step.by === 'user' ? 'You: ' : asSql ? 'SQL: ' : '';
    const code = { fontFamily: 'var(--code-font)', fontSize: 12 } as const;
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
        title={query}
        sx={{
          borderLeft: '2px solid',
          borderColor: selected ? 'var(--canvas-trace)' : 'transparent',
          borderRadius: '0 4px 4px 0',
          px: 1,
          py: 0.5,
          cursor: step.snapshot ? 'pointer' : 'default',
          backgroundColor: selected ? 'var(--canvas-chip-bg)' : 'transparent',
          '&:hover': { backgroundColor: 'var(--canvas-chip-bg)' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography
            sx={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-color)', ...oneLine, ...(step.reason ? {} : code) }}
          >
            {step.reason ?? `${prefix}${query}`}
          </Typography>
          {step.running ? (
            <CircularProgress size={10} thickness={6} sx={{ color: 'var(--canvas-trace)', flexShrink: 0 }} />
          ) : step.error ? (
            <ErrorOutline sx={{ fontSize: 14, color: failed, flexShrink: 0, alignSelf: 'center' }} />
          ) : (
            <Typography sx={{ fontSize: 11, color: dim, flexShrink: 0 }}>
              {step.rowCount} row{step.rowCount === 1 ? '' : 's'}
            </Typography>
          )}
        </Box>
        {step.reason && (
          <Typography sx={{ ...code, color: dim, ...oneLine }}>
            {prefix}
            {query}
          </Typography>
        )}
        {step.error && (
          <Typography sx={{ fontSize: 12, color: failed, ...oneLine }} title={step.error}>
            {step.error}
          </Typography>
        )}
      </Box>
    );
  },
);

/** One proposed change, in the words the results grid uses, and whether it loosens an Except rule. */
function describeChange(change: PolicyChange, rules: AccessPolicyModule[]): { text: string; loosens: boolean } {
  // Mid-sentence: "hide name contains …", not "hide Name contains …".
  const what = (rule: AccessPolicyRule) =>
    describeMatcher(rule.type === 'hide' ? rule.match : rule).replace(/^[A-Z](?=[a-z])/, c => c.toLowerCase());
  if ('add' in change) {
    const replaces = ownHideRules(rules, change.add).length > 0;
    const text = `${change.add.type === 'hide' ? 'Hide' : 'Show'} ${what(change.add)}`;
    return { text: replaces ? `${text}, in place of the Except rule hiding it` : text, loosens: replaces };
  }
  const id = 'remove' in change ? change.remove : 'enable' in change ? change.enable : change.disable;
  const rule = rules.find(m => m.id === id);
  if (!rule) return { text: `${Object.keys(change)[0]} a rule that no longer exists`, loosens: false };
  const hide = rule.type === 'hide';
  const kind = hide ? 'hiding' : 'showing';
  const except = hide ? ' (an Except rule)' : '';
  if ('remove' in change) return { text: `Stop ${kind} ${what(rule)}${except}`, loosens: hide };
  if ('enable' in change) return { text: `Turn on: ${hide ? 'hide' : 'show'} ${what(rule)}`, loosens: false };
  return { text: `Turn off: ${hide ? 'hide' : 'show'} ${what(rule)}${except}`, loosens: hide };
}

const ProposalStep = observer(
  ({ investigation, step }: { investigation: Investigation; step: Extract<InvestigationStep, { kind: 'proposal' }> }) => {
    const { global } = useStores();
    const [declining, setDeclining] = useState(false);
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const { proposal } = step;
    const pending = step.status === 'pending';
    const connection = global.connections.find(c => c.id === proposal.profileId);
    // Rules a change names by id: as they are now, or as they were before
    // Apply removed them.
    const rules = step.before ?? global.connectionPolicy(proposal.profileId)?.rules ?? [];
    const changes = proposal.changes.map(change => describeChange(change, rules));

    const answer = async (apply: boolean) => {
      setBusy(true);
      setError('');
      const ok = await global.answerPolicyProposal(investigation.id, proposal.id, apply, comment.trim() || undefined);
      setBusy(false);
      if (!ok) setError("Couldn't save that to the access policy, so nothing changed.");
    };
    const undo = async () => {
      setBusy(true);
      const ok = await global.undoPolicyProposal(investigation.id, proposal.id);
      setBusy(false);
      if (!ok) setError("Couldn't put the access policy back.");
    };

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
          <PolicyOutlined sx={{ fontSize: 16, color: pending ? 'var(--notification-color)' : dim }} />
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--text-color)' }}>
            The agent proposes a policy change
          </Typography>
        </Box>
        {proposal.reason && (
          <Typography sx={{ fontSize: 13, color: 'var(--text-color)', mb: 0.5, lineHeight: 1.4 }}>
            {proposal.reason}
          </Typography>
        )}
        <Box component="ul" sx={{ m: 0, mb: 0.75, pl: 2.25 }}>
          {changes.map((change, i) => (
            <Typography
              component="li"
              key={i}
              sx={{
                fontSize: 12,
                fontFamily: 'var(--code-font)',
                color: change.loosens ? 'var(--text-warning-color)' : 'var(--text-color)',
                lineHeight: 1.5,
              }}
            >
              {change.text}
            </Typography>
          ))}
        </Box>
        {!pending ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CheckCircleOutline sx={{ fontSize: 14, color: dim }} />
            <Typography sx={{ fontSize: 12, color: dim, flex: 1 }}>
              {step.status === 'applied'
                ? 'Applied.'
                : step.status === 'undone'
                  ? 'Applied, then undone.'
                  : step.status === 'expired'
                    ? 'The agent stopped waiting for an answer.'
                    : 'Declined.'}
            </Typography>
            {step.status === 'applied' && (
              <Button size="small" disabled={busy} onClick={undo} sx={{ minWidth: 0, py: 0 }}>
                Undo
              </Button>
            )}
          </Box>
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
            <Typography sx={{ fontSize: 12, color: dim, mb: 1, lineHeight: 1.4 }}>
              Changes {connection ? `${connection.label}'s` : "this connection's"} access policy. No other connection
              changes.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button size="small" variant="contained" disabled={busy} onClick={() => answer(true)}>
                Apply
              </Button>
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
    case 'proposal':
      return <ProposalStep investigation={investigation} step={step} />;
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
      return <CallLine step={step} />;
  }
});

type CallStep = Extract<InvestigationStep, { kind: 'call' }>;

const CallLine = observer(({ step }: { step: CallStep }) => (
  <Typography
    sx={{ fontSize: 12, color: step.ok === false ? failed : dim, px: 1, ...oneLine }}
    title={step.ok === false && step.outcome ? step.outcome : step.detail}
  >
    {step.endedAt === undefined ? '… ' : ''}
    {step.summary}
    {step.ok === false ? ': failed' : ''}
  </Typography>
));

/**
 * Lookups in a row, like a run of table searches and completions, as one
 * line: the latest, and how many came before it. Clicking opens them all.
 */
const CallGroup = observer(({ steps }: { steps: CallStep[] }) => {
  const [open, setOpen] = useState(false);
  if (steps.length === 1 || open) {
    return (
      <Box
        onClick={steps.length > 1 ? () => setOpen(false) : undefined}
        sx={{ cursor: steps.length > 1 ? 'pointer' : 'default' }}
      >
        {steps.map(step => (
          <CallLine key={step.id} step={step} />
        ))}
      </Box>
    );
  }
  const last = steps[steps.length - 1];
  const failures = steps.filter(s => s.ok === false).length;
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => setOpen(true)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen(true);
        }
      }}
      sx={{ display: 'flex', alignItems: 'baseline', cursor: 'pointer', '&:hover': { color: 'var(--text-color)' } }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <CallLine step={last} />
      </Box>
      <Typography sx={{ fontSize: 11, color: failures ? failed : dim, flexShrink: 0, pr: 1 }}>
        +{steps.length - 1}
        {failures ? `, ${failures} failed` : ''}
      </Typography>
    </Box>
  );
});

/** The steps, with each run of lookup calls in one group. */
function grouped(steps: InvestigationStep[]): (InvestigationStep | CallStep[])[] {
  const items: (InvestigationStep | CallStep[])[] = [];
  for (const step of steps) {
    const previous = items[items.length - 1];
    if (step.kind !== 'call') items.push(step);
    else if (Array.isArray(previous)) previous.push(step);
    else items.push([step]);
  }
  return items;
}

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

  // Follow the newest step, as it arrives and as it grows, until the user
  // scrolls up. Scrolling back to the bottom follows again. A note the user
  // just sent is always brought into view.
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [behind, setBehind] = useState(false);
  const toBottom = () => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  };
  const onScroll = () => {
    const el = list.current;
    if (!el) return;
    following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (following.current) setBehind(false);
  };
  useEffect(() => {
    if (!content.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (following.current) toBottom();
      else setBehind(true);
    });
    observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  const lastStep = investigation.steps.at(-1);
  const lastNote = lastStep?.kind === 'note' ? lastStep.id : undefined;
  useEffect(() => {
    if (!lastNote) return;
    following.current = true;
    toBottom();
  }, [lastNote]);
  const backToLatest = () => {
    following.current = true;
    setBehind(false);
    toBottom();
    global.showInvestigationStep(investigation.id, null);
  };

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
        onScroll={onScroll}
        className="styled-scrollbar"
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
      >
        <Box ref={content} sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {investigation.steps.length === 0 && (
            <Typography sx={{ fontSize: 13, color: dim }}>
              Each step the agent takes here shows up as it happens, with what it saw.
            </Typography>
          )}
          {grouped(investigation.steps).map(item =>
            Array.isArray(item) ? (
              <CallGroup key={item[0].id} steps={item} />
            ) : (
              <Step key={item.id} investigation={investigation} step={item} />
            ),
          )}
        </Box>
      </Box>

      {(behind || investigation.selectedStepId !== null) && (
        <Box sx={{ px: 1.25, pb: 0.75, display: 'flex', justifyContent: 'center' }}>
          <Button size="small" startIcon={<ArrowDownward sx={{ fontSize: 16 }} />} onClick={backToLatest}>
            {behind ? 'New steps below' : 'Back to the latest'}
          </Button>
        </Box>
      )}

      <NoteComposer investigation={investigation} />
    </Box>
  );
});

export default InvestigationPanel;
