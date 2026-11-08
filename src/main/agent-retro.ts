// A retro on how agents used Beamlynx, from the calls agent-log.ts saved in
// beamlynx.db. scripts/agent-retro.mjs prints it. See
// beamlynx-plans/plans/024-agents-work-in-pine.md, part E.
//
// Pure functions, no Electron import: the script and __tests__ load the
// compiled file directly.
import type { AgentCall } from './app-db';

/**
 * Where a failure points:
 * - pine-gap: something the agent asked for that Pine can't say yet. A backlog idea.
 * - unclear: the agent misused a tool or wrote Pine wrong. A clearer message or instruction.
 * - bug: Beamlynx broke. A PR.
 * - environment: the app, the database or the harness wasn't there. Nothing to change.
 * - unclassified: none of the above matched. Read it and add a rule.
 */
export type FailureKind = 'pine-gap' | 'unclear' | 'bug' | 'environment' | 'unclassified';

const RULES: [FailureKind, RegExp][] = [
  // SQL to Pine said what it can't convert.
  ['pine-gap', /didn't convert to Pine|isn't in Pine|doesn't support|not supported|Only COUNT\(\*\) converts|Arithmetic isn't/i],
  ['environment', /ECONNREFUSED|Can't reach the database|isn't running|has not published its control-plane token|Restart Beamlynx|Timed out waiting|classifier|Permission for this action was denied|No connection selected/i],
  ['bug', /could not be cloned|Uncaught|TypeError|ReferenceError|Internal error|NullPointerException|ClassCastException|Unexpected token/i],
  ['unclear', /Parse error|Expected one of|is hidden by the access policy|is masked|Unknown column|no such column|does not exist|There is no connection|needs a|must be|isn't a|is not a|Refusing to change/i],
];

export function classifyFailure(error: string | null | undefined): FailureKind {
  const text = error ?? '';
  for (const [kind, pattern] of RULES) if (pattern.test(text)) return kind;
  return 'unclassified';
}

/** The tools whose success means the agent got an answer from the data. */
const QUERY_TOOLS = new Set(['run_query', 'run_sql_as_pine']);

export type SessionReport = {
  investigationId: string;
  startedAt: number;
  endedAt: number;
  question: string | null;
  findings: string[];
  calls: number;
  failed: number;
  /** Calls made before the first query that returned rows; null when none did. */
  callsBeforeFirstAnswer: number | null;
  /** Failed calls the agent followed with another call to the same tool. */
  retriesAfterError: number;
  failures: { tool: string; kind: FailureKind; error: string; input: string | null }[];
};

export type RetroReport = {
  sessions: SessionReport[];
  totals: {
    sessions: number;
    calls: number;
    failed: number;
    byKind: Record<FailureKind, number>;
    byTool: Record<string, { calls: number; failed: number }>;
    sessionsWithFinding: number;
    sessionsWithAnswer: number;
  };
};

export function analyze(calls: AgentCall[]): RetroReport {
  const bySession = new Map<string, AgentCall[]>();
  for (const call of [...calls].sort((a, b) => a.startedAt - b.startedAt)) {
    bySession.set(call.investigationId, [...(bySession.get(call.investigationId) ?? []), call]);
  }
  const byKind: Record<FailureKind, number> = { 'pine-gap': 0, unclear: 0, bug: 0, environment: 0, unclassified: 0 };
  const byTool: Record<string, { calls: number; failed: number }> = {};
  const sessions: SessionReport[] = [];
  for (const [investigationId, list] of bySession) {
    const failures: SessionReport['failures'] = [];
    let retries = 0;
    let firstAnswer: number | null = null;
    list.forEach((call, i) => {
      byTool[call.tool] ??= { calls: 0, failed: 0 };
      byTool[call.tool].calls++;
      if (call.ok === false) {
        byTool[call.tool].failed++;
        const kind = classifyFailure(call.error);
        byKind[kind]++;
        failures.push({ tool: call.tool, kind, error: call.error ?? '', input: call.input });
        if (list[i + 1]?.tool === call.tool) retries++;
      } else if (firstAnswer === null && call.ok && QUERY_TOOLS.has(call.tool) && (call.rows ?? 0) > 0) {
        firstAnswer = i;
      }
    });
    sessions.push({
      investigationId,
      startedAt: list[0].startedAt,
      endedAt: Math.max(...list.map(c => c.endedAt ?? c.startedAt)),
      question: [...list].reverse().find(c => c.question)?.question ?? null,
      findings: list.filter(c => c.finding).map(c => c.finding as string),
      calls: list.length,
      failed: failures.length,
      callsBeforeFirstAnswer: firstAnswer,
      retriesAfterError: retries,
      failures,
    });
  }
  return {
    sessions,
    totals: {
      sessions: sessions.length,
      calls: calls.length,
      failed: sessions.reduce((n, s) => n + s.failed, 0),
      byKind,
      byTool,
      sessionsWithFinding: sessions.filter(s => s.findings.length).length,
      sessionsWithAnswer: sessions.filter(s => s.callsBeforeFirstAnswer !== null).length,
    },
  };
}

const KIND_LABEL: Record<FailureKind, string> = {
  'pine-gap': 'Pine gap (a backlog idea)',
  unclear: 'Unclear tool, message or Pine (an instruction or message change)',
  bug: 'Bug in Beamlynx (a PR)',
  environment: 'Environment (nothing to change)',
  unclassified: 'Unclassified (read it, and add a rule to agent-retro.ts)',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : '-');
const day = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const oneLine = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** The report as plain text, for a terminal or a file. */
export function formatReport(report: RetroReport): string {
  const t = report.totals;
  if (!t.sessions) return 'No agent calls saved yet. Calls are saved from beamlynx-desktop with agent-log.ts onwards.';
  const lines: string[] = [];
  lines.push(`Agent retro: ${t.sessions} session${t.sessions === 1 ? '' : 's'}, ${t.calls} calls, ${t.failed} failed (${pct(t.failed, t.calls)}).`);
  lines.push(`Sessions that got rows from a query: ${t.sessionsWithAnswer} of ${t.sessions}. Sessions that noted a finding: ${t.sessionsWithFinding} of ${t.sessions}.`);
  lines.push('');
  lines.push('Calls by tool (failed / all):');
  for (const [tool, n] of Object.entries(t.byTool).sort((a, b) => b[1].calls - a[1].calls)) {
    lines.push(`  ${tool.padEnd(22)} ${String(n.failed).padStart(4)} / ${n.calls}`);
  }
  lines.push('');
  lines.push('Failures by kind:');
  for (const kind of Object.keys(KIND_LABEL) as FailureKind[]) {
    if (t.byKind[kind]) lines.push(`  ${String(t.byKind[kind]).padStart(4)}  ${KIND_LABEL[kind]}`);
  }
  for (const kind of Object.keys(KIND_LABEL) as FailureKind[]) {
    if (kind === 'environment') continue;
    const items = report.sessions.flatMap(s => s.failures.filter(f => f.kind === kind));
    if (!items.length) continue;
    lines.push('');
    lines.push(`${KIND_LABEL[kind]}:`);
    const seen = new Map<string, { n: number; tool: string; input: string | null }>();
    for (const f of items) {
      const key = oneLine(f.error, 160);
      const entry = seen.get(key) ?? { n: 0, tool: f.tool, input: f.input };
      entry.n++;
      seen.set(key, entry);
    }
    for (const [error, { n, tool, input }] of [...seen].sort((a, b) => b[1].n - a[1].n)) {
      lines.push(`  ${n}x ${tool}: ${error}`);
      if (input) lines.push(`      sent: ${oneLine(input, 140)}`);
    }
  }
  lines.push('');
  lines.push('Sessions, newest first:');
  for (const s of [...report.sessions].reverse()) {
    const answer =
      s.callsBeforeFirstAnswer === null ? 'no rows from a query' : `rows after ${plural(s.callsBeforeFirstAnswer, 'call')}`;
    lines.push(
      `  ${day(s.startedAt)}  ${plural(s.calls, 'call')}, ${s.failed} failed (${pct(s.failed, s.calls)}), ` +
        `${plural(s.retriesAfterError, 'retry', 'retries')} after an error, ${answer}, ` +
        `${s.findings.length ? 'finding noted' : 'no finding'}`,
    );
    if (s.question) lines.push(`      question: ${oneLine(s.question, 140)}`);
  }
  return lines.join('\n');
}
