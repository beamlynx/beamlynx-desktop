import { useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, IconButton, TextField, Typography } from '@mui/material';
import {
  ArrowDownward,
  ChevronRight,
  CheckCircleOutline,
  ErrorOutline,
  LightbulbOutlined,
  PolicyOutlined,
  SettingsOutlined,
  VisibilityOutlined,
} from '@mui/icons-material';
import { observer } from 'mobx-react-lite';
import { useStores } from '../store/store-container';
import { isStaleCall, type Investigation, type InvestigationStep } from '../store/investigations';
import { describeMatcher, ownHideRules } from '../utils/accessPolicy';
import type { AccessPolicyModule, AccessPolicyRule } from '../store/client';
import type { PolicyChange } from '../desktop';

/**
 * The timeline of an agent's investigation (store/investigations.ts), beside
 * its canvas and results: every step it took and what it saw, and the
 * decisions it is waiting on.
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

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * A query as one line: why the agent ran it, and how it went. The query
 * itself, and any error, are in the tooltip, and clicking the line shows
 * the query and its result in the tab.
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
    // Without a reason, say what it read: the table it starts from.
    const table = /^[A-Za-z_][\w.]*/.exec(query)?.[0];
    const label =
      step.reason ??
      (asSql ? 'Sent SQL' : `${step.by === 'user' ? 'You queried' : 'Queried'} ${table ?? 'the database'}`);
    const tooltip = [`${asSql ? 'SQL: ' : ''}${query}`, step.error].filter(Boolean).join('\n\n');
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
        title={tooltip}
        aria-current={selected ? 'true' : undefined}
        sx={{
          // The step shown in the tab is marked by its dot (stepDot) and a
          // soft background; the others stay quiet until hovered.
          borderRadius: 1,
          px: 1,
          py: 0.5,
          cursor: step.snapshot ? 'pointer' : 'default',
          color: selected ? 'var(--text-color)' : dim,
          backgroundColor: selected ? 'var(--canvas-chip-bg)' : 'transparent',
          '&:hover': { backgroundColor: 'var(--canvas-chip-bg)', color: 'var(--text-color)' },
          '&:focus-visible': { outline: '1px solid var(--canvas-trace)', outlineOffset: -1 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13, color: 'inherit', ...oneLine }}>
            {label}
          </Typography>
          {step.running ? (
            <CircularProgress size={10} thickness={6} sx={{ color: 'var(--canvas-trace)', flexShrink: 0 }} />
          ) : step.error ? (
            <ErrorOutline sx={{ fontSize: 14, color: failed, flexShrink: 0, alignSelf: 'center' }} />
          ) : (
            <Typography
              sx={{ fontSize: 11, color: dim, flexShrink: 0 }}
              title={
                step.snapshot?.rowsDropped
                  ? `Only the first ${step.snapshot.rows.length} are kept to show again.`
                  : undefined
              }
            >
              {step.rowCount} row{step.rowCount === 1 ? '' : 's'}
            </Typography>
          )}
        </Box>
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
    const replaced = ownHideRules(rules, change.add);
    const text = `${change.add.type === 'hide' ? 'Hide' : 'Show'} ${what(change.add)}`;
    if (replaced.length === 0) return { text, loosens: false };
    // Named, since an Except rule without a schema hides the column in
    // every schema, and taking it out shows it in all of them.
    const hides = replaced.map(m => `hide ${what(m)}`).join('; ');
    return { text: `${text}, in place of the Except rule (${hides})`, loosens: true };
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
      try {
        const ok = await global.answerPolicyProposal(investigation.id, proposal.id, apply, comment.trim() || undefined);
        if (!ok) setError("Couldn't save that to the data masking, so nothing changed.");
      } catch (e) {
        setError(`Couldn't save that to the data masking, so nothing changed. ${messageOf(e)}`);
      } finally {
        setBusy(false);
      }
    };
    const undo = async () => {
      setBusy(true);
      setError('');
      try {
        const ok = await global.undoPolicyProposal(investigation.id, proposal.id);
        if (!ok) setError("Couldn't put the data masking back.");
      } catch (e) {
        setError(messageOf(e));
      } finally {
        setBusy(false);
      }
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
            The agent proposes a change to data masking
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
                ? step.agentGone
                  ? 'Applied. The agent had stopped waiting, so it wasn’t told.'
                  : 'Applied.'
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
              Changes {connection ? `${connection.label}'s` : "this database's"} data masking. No other database
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
    const [error, setError] = useState('');
    const pending = step.status === 'pending';
    const shown = investigation.selectedStepId === step.id;
    const rows = step.preview?.rows.length ?? 0;
    const pine = step.expression.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '').trim();

    const answer = async (reveal: boolean) => {
      setBusy(true);
      setError('');
      try {
        const ok = await global.answerReveal(investigation.id, step.requestId, reveal, comment.trim() || undefined);
        if (!ok && step.status !== 'expired') setError('This request can no longer be answered.');
      } catch (e) {
        setError(`Couldn't send your answer to the agent. ${messageOf(e)}`);
      } finally {
        setBusy(false);
      }
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
          Data masking hides some of what this query returns.
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
        {(step.status === 'revealed' || step.status === 'declined' || step.status === 'expired') && (
          <Typography sx={{ fontSize: 12, color: dim, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CheckCircleOutline sx={{ fontSize: 14 }} />
            {step.status === 'revealed'
              ? `Revealed: the agent has these ${rows} rows.`
              : step.status === 'expired'
                ? 'The agent stopped waiting for an answer.'
                : step.note ?? 'Declined.'}
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
        {error && <Typography sx={{ fontSize: 12, color: failed, mt: 0.5 }}>{error}</Typography>}
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
        <Box sx={{ display: 'flex', gap: 1, px: 0.5, py: 0.75 }}>
          <LightbulbOutlined sx={{ fontSize: 17, color: 'var(--notification-color)', mt: '3px', flexShrink: 0 }} />
          <Typography sx={{ fontSize: 14, color: 'var(--text-color)', lineHeight: 1.5 }}>{step.text}</Typography>
        </Box>
      );
    case 'call':
      return <CallLine step={step} />;
    case 'question':
      // A question heads its section (Section), not a line of its own.
      return null;
  }
});

type CallStep = Extract<InvestigationStep, { kind: 'call' }>;

const CallLine = observer(({ step }: { step: CallStep }) => {
  const { global } = useStores();
  // A call whose end never arrived isn't shown as going on for good.
  const stale = isStaleCall(step, global.agentActivity.now);
  return (
    <Typography
      sx={{ fontSize: 12, color: step.ok === false ? failed : dim, px: 1, ...oneLine }}
      title={step.ok === false && step.outcome ? step.outcome : stale ? 'Its end never arrived.' : step.detail}
    >
      {step.endedAt === undefined && !stale ? '… ' : ''}
      {step.summary}
      {step.ok === false ? ': failed' : ''}
    </Typography>
  );
});

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

type WorkStep = Extract<InvestigationStep, { kind: 'query' | 'call' }>;

/**
 * The steps, with each run of queries and lookups in one group: the agent
 * at work. Findings and decisions stand between them, on their own.
 */
function grouped(steps: InvestigationStep[]): (InvestigationStep | WorkStep[])[] {
  const items: (InvestigationStep | WorkStep[])[] = [];
  for (const step of steps) {
    const previous = items[items.length - 1];
    if (step.kind !== 'query' && step.kind !== 'call') items.push(step);
    else if (Array.isArray(previous)) previous.push(step);
    else items.push([step]);
  }
  return items;
}

type QuestionStep = Extract<InvestigationStep, { kind: 'question' }>;
type Section = { question?: QuestionStep; steps: InvestigationStep[] };

/**
 * The steps split by question: each question the agent set starts a
 * section of the steps after it. Steps before the first question, if any,
 * are a section without one.
 */
function sections(steps: InvestigationStep[]): Section[] {
  const result: Section[] = [];
  for (const step of steps) {
    if (step.kind === 'question') result.push({ question: step, steps: [] });
    else if (result.length === 0) result.push({ steps: [step] });
    else result[result.length - 1].steps.push(step);
  }
  return result.filter(s => s.question || s.steps.length > 0);
}

/** A section's steps, with each run of work in one group. */
const SectionSteps = ({ investigation, steps }: { investigation: Investigation; steps: InvestigationStep[] }) => (
  <>
    {grouped(steps).map(item =>
      Array.isArray(item) ? (
        <WorkGroup key={item[0].id} investigation={investigation} steps={item} />
      ) : (
        <Step key={item.id} investigation={investigation} step={item} />
      ),
    )}
  </>
);

/**
 * An earlier question, as one line: the question and how much work it
 * took. Clicking opens its steps. It opens on its own while the query
 * shown in the tab is one of them.
 */
const EarlierQuestion = observer(({ investigation, section }: { investigation: Investigation; section: Section }) => {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const holdsSelected = section.steps.some(s => s.id === investigation.selectedStepId);
  const open = userOpen ?? holdsSelected;
  const findings = section.steps.filter(s => s.kind === 'finding').length;
  const work = section.steps.filter(s => s.kind === 'query' || s.kind === 'call').length;
  const text = section.question?.text ?? 'Before the first question';
  const toggle = () => setUserOpen(!open);
  return (
    <Box>
      <Box
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        title={text}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 0.5,
          py: 0.25,
          borderRadius: 1,
          cursor: 'pointer',
          color: dim,
          '&:hover': { color: 'var(--text-color)' },
          '&:focus-visible': { outline: '1px solid var(--canvas-trace)', outlineOffset: -1 },
        }}
      >
        <ChevronRight
          sx={{
            fontSize: 16,
            flexShrink: 0,
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 120ms ease',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        />
        <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'inherit', ...oneLine }}>
          {text}
        </Typography>
        <Typography sx={{ fontSize: 11, color: dim, flexShrink: 0, pr: 0.5 }}>
          {work} step{work === 1 ? '' : 's'}
          {findings ? `, ${findings} finding${findings === 1 ? '' : 's'}` : ''}
        </Typography>
      </Box>
      {open && (
        <Box sx={{ pl: 1.5, pt: 0.5, pb: 0.75, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <SectionSteps investigation={investigation} steps={section.steps} />
        </Box>
      )}
    </Box>
  );
});

/** Each run of lookup calls in one line, inside an open group. */
function callRuns(steps: WorkStep[]): (WorkStep | CallStep[])[] {
  const items: (WorkStep | CallStep[])[] = [];
  for (const step of steps) {
    const previous = items[items.length - 1];
    if (step.kind !== 'call') items.push(step);
    else if (Array.isArray(previous)) previous.push(step);
    else items.push([step]);
  }
  return items;
}

/** What a step was for, in words: a query's reason, or a lookup's summary. */
const purpose = (step: WorkStep): string | undefined => (step.kind === 'query' ? step.reason : step.summary);

/** Whether any step of a run is still going. A call whose end never arrived stops counting. */
const isBusy = (steps: WorkStep[], now: number) =>
  steps.some(s => (s.kind === 'query' ? s.running : s.endedAt === undefined && !isStaleCall(s, now)));

/**
 * One step of an opened run: a dot on the line that runs down its left
 * side, so the steps can be scanned from top to bottom. `dotTop` is the
 * middle of the entry's first line, where the dot sits. The line runs
 * from the first entry's dot to the last one's.
 */
const TimelineEntry = ({
  color,
  dotTop,
  size = 7,
  children,
}: {
  color: string;
  dotTop: number;
  size?: number;
  children: React.ReactNode;
}) => (
  <Box
    sx={{
      position: 'relative',
      pl: 2.25,
      pb: 0.25,
      '&::before': {
        content: '""',
        position: 'absolute',
        left: 5,
        top: 0,
        bottom: 0,
        width: '1px',
        backgroundColor: 'var(--border-color)',
      },
      '&:first-of-type::before': { top: dotTop },
      '&:last-of-type': { pb: 0 },
      '&:last-of-type::before': { bottom: 'auto', height: dotTop },
      '&:only-of-type::before': { display: 'none' },
    }}
  >
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        left: 5.5 - size / 2,
        top: dotTop - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        // A ring in the panel's colour keeps the dot clear of the line.
        boxShadow: '0 0 0 2px var(--background-color)',
      }}
    />
    {children}
  </Box>
);

/**
 * Where a step's dot sits inside an opened run, and its colour: blue while
 * it runs, red when it failed, dim otherwise, and larger and in the accent
 * colour for the query shown in the tab. A run of lookups shares one dot.
 */
function stepDot(
  item: WorkStep | CallStep[],
  now: number,
  selectedId: string | undefined,
): { color: string; dotTop: number; size?: number } {
  const steps = Array.isArray(item) ? item : [item];
  // The query shown in the tab: a larger dot in the accent colour.
  if (!Array.isArray(item) && item.id === selectedId) {
    return { color: 'var(--canvas-trace)', dotTop: 13, size: 9 };
  }
  const color = isBusy(steps, now)
    ? 'var(--canvas-trace)'
    : steps.some(s => (s.kind === 'query' ? !!s.error : s.ok === false))
      ? failed
      : dim;
  // The middle of the first line: a query's is 13 px type with 4 px above,
  // a lookup's is 12 px type.
  return { color, dotTop: !Array.isArray(item) && item.kind === 'query' ? 13 : 9 };
}

/**
 * A run of the agent's work as one quiet line: what it is doing, or last
 * did, and how many steps that took. Clicking it opens the steps, and each
 * query there shows its result again.
 */
const WorkGroup = observer(({ investigation, steps }: { investigation: Investigation; steps: WorkStep[] }) => {
  const { global } = useStores();
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const now = global.agentActivity.now;
  const busy = isBusy(steps, now);
  // A query picked from the canvas's results, or by an older click, is
  // shown: its group opens.
  const holdsSelected = steps.some(s => s.id === investigation.selectedStepId);
  // The query shown in the tab: the one picked, or else the latest.
  const shownId = investigation.selectedStepId ?? investigation.latestQuery?.id;
  const open = userOpen ?? holdsSelected;
  const failures = steps.filter(s => (s.kind === 'query' ? !!s.error : s.ok === false)).length;
  const queries = steps.filter(s => s.kind === 'query').length;
  // While it works, the newest step says what it is doing. After, the
  // newest reason says what the run was for.
  const latest = steps[steps.length - 1];
  const label =
    (busy ? purpose(latest) : undefined) ??
    [...steps].reverse().map(s => (s.kind === 'query' ? s.reason : undefined)).find(Boolean) ??
    purpose(latest) ??
    (queries === 1 ? 'Ran a query' : `Ran ${queries} queries`);
  const toggle = () => setUserOpen(!open);

  return (
    <Box>
      <Box
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        title={label}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 0.5,
          py: 0.25,
          borderRadius: 1,
          cursor: 'pointer',
          color: dim,
          '&:hover': { color: 'var(--text-color)' },
          '&:focus-visible': { outline: '1px solid var(--canvas-trace)', outlineOffset: -1 },
        }}
      >
        <ChevronRight
          sx={{
            fontSize: 16,
            flexShrink: 0,
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 120ms ease',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        />
        <Typography sx={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'inherit', ...oneLine }}>{label}</Typography>
        {busy ? (
          <CircularProgress size={10} thickness={6} sx={{ color: 'var(--canvas-trace)', flexShrink: 0, mr: 0.5 }} />
        ) : (
          <Typography sx={{ fontSize: 11, color: failures ? failed : dim, flexShrink: 0, pr: 0.5 }}>
            {steps.length} step{steps.length === 1 ? '' : 's'}
            {failures ? `, ${failures} failed` : ''}
          </Typography>
        )}
      </Box>
      {open && (
        <Box sx={{ ml: 0.75, mt: 0.25, mb: 0.5 }}>
          {callRuns(steps).map(item => (
            <TimelineEntry key={Array.isArray(item) ? item[0].id : item.id} {...stepDot(item, now, shownId)}>
              {Array.isArray(item) ? (
                <CallGroup steps={item} />
              ) : (
                <Step investigation={investigation} step={item} />
              )}
            </TimelineEntry>
          ))}
        </Box>
      )}
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
  // scrolls up. Scrolling back to the bottom follows again.
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
  const backToLatest = () => {
    following.current = true;
    setBehind(false);
    toBottom();
    global.showInvestigationStep(investigation.id, null);
  };

  // What this investigation's own agent is doing: several can work at once.
  // The timeline by question: the latest one in full, the earlier ones folded.
  const split = sections(investigation.steps);
  const latest = split[split.length - 1] ?? { steps: [] };
  const earlier = split.slice(0, -1);

  const current = activity.currentFor(investigation.id);
  const working = activity.workingFor(investigation.id) && current;
  // After a pause, say why it may be quiet: the agent also uses other
  // tools, which beamlynx can't see.
  const sinceLastCall = investigation.lastCallAt ? now - investigation.lastCallAt : undefined;
  // While it works, its newest group in the timeline says with what.
  const status = working
    ? 'Working…'
    : sinceLastCall === undefined
      ? 'Waiting for the agent'
      : sinceLastCall < 15000
        ? 'Last call just now'
        : `Last call ${ago(sinceLastCall)}. The agent may be working in another tool.`;

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
            onClick={() => global.showSettingsSection('mcp')}
            aria-label="Agent settings"
            title="Agent settings: connect an agent, choose its databases, and data masking"
            sx={{ color: dim, mt: '-2px', mr: '-6px', '&:hover': { color: 'var(--text-color)' } }}
          >
            <SettingsOutlined sx={{ fontSize: 17 }} />
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
        <Box ref={content} sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {earlier.length === 0 && latest.steps.length === 0 && (
            <Typography sx={{ fontSize: 13, color: dim }}>
              Each step the agent takes here shows up as it happens, with what it saw.
            </Typography>
          )}
          {/* Earlier questions fold to one line each. The current one is the
              header's, so its steps follow without a heading. */}
          {earlier.map(section => (
            <EarlierQuestion
              key={section.question?.id ?? 'before'}
              investigation={investigation}
              section={section}
            />
          ))}
          {earlier.length > 0 && <Box sx={{ borderTop: '1px solid var(--border-color)', my: 0.25 }} />}
          <SectionSteps investigation={investigation} steps={latest.steps} />
        </Box>
      </Box>

      {(behind || investigation.selectedStepId !== null) && (
        <Box sx={{ px: 1.25, pb: 0.75, display: 'flex', justifyContent: 'center' }}>
          <Button size="small" startIcon={<ArrowDownward sx={{ fontSize: 16 }} />} onClick={backToLatest}>
            {behind ? 'New steps below' : 'Back to the latest'}
          </Button>
        </Box>
      )}

    </Box>
  );
});

export default InvestigationPanel;
