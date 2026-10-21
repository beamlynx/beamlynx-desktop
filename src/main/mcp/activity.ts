// What an agent is doing, for the person watching. Every MCP tool call is
// reported to the app as it starts and as it ends (see stdio-relay.ts's
// reportActivity and control-plane-server.ts's POST /activity), so the app
// shows that an agent is working before its first query lands, including
// calls that never reach the window, like get_pine_doc.
//
// Pure functions only, no `electron` import: __tests__/activity.test.js
// loads this file's compiled output directly.

export type AgentActivity = {
  /** One id per call, the same on its start and its end. */
  id: string;
  /** The MCP tool, e.g. `find_tables`. */
  tool: string;
  phase: 'start' | 'end';
  /** When this phase happened, in ms since the epoch. */
  at: number;
  /** One line for the person: what the agent is doing. */
  summary: string;
  /** What the agent sent: an expression, SQL, a search, a topic. */
  detail?: string;
  /** On `end`: whether the call succeeded. */
  ok?: boolean;
  /** On `end`: one line saying how it went, or the error. */
  outcome?: string;
  /**
   * The Claude session the call came from (see investigations.ts). Set by the
   * control plane from the request, never taken from the body.
   */
  investigationId?: string;
};

const MAX_ID = 64;
const MAX_SUMMARY = 200;
const MAX_DETAIL = 4000;
const MAX_OUTCOME = 500;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const quoted = (text: unknown) => (typeof text === 'string' ? `"${clip(text, 60)}"` : '');

/** One line saying what a call to `tool` with `args` does, and what it sent. */
export function describeCall(tool: string, args: Record<string, unknown>): { summary: string; detail?: string } {
  const text = (key: string) => (typeof args[key] === 'string' ? (args[key] as string) : undefined);
  switch (tool) {
    case 'list_connections':
      return { summary: 'Listing the connections it may use' };
    case 'find_tables':
      return { summary: `Searching for tables like ${quoted(args.query)}` };
    case 'complete_query':
      return { summary: 'Looking up what can come next in a query', detail: text('expression') };
    case 'get_pine_doc':
      return { summary: `Reading the Pine reference on ${quoted(args.topic)}` };
    case 'run_query':
      return { summary: 'Running a query', detail: text('expression') };
    case 'run_sql_as_pine':
      return { summary: 'Converting SQL to Pine and running it', detail: text('sql') };
    case 'open_in_desktop':
      return { summary: 'Opening a query in a tab', detail: text('expression') };
    case 'request_reveal':
      return { summary: 'Asking you to reveal hidden values', detail: text('reason') ?? text('expression') };
    case 'get_access_policy':
      return { summary: 'Reading the access policy' };
    case 'propose_policy_change':
      return { summary: 'Proposing a change to the access policy', detail: text('reason') };
    case 'check_reveal':
      return { summary: 'Waiting for your decision on a reveal request' };
    case 'set_question':
      return { summary: 'Naming the question it is investigating', detail: text('question') };
    case 'note_finding':
      return { summary: 'Noting what it found', detail: text('finding') };
    default:
      return { summary: `Calling ${tool}` };
  }
}

/** How a tool's result went: an MCP result says it failed with `isError`, it doesn't throw. */
export function outcomeOf(result: unknown): { ok: boolean; outcome?: string } {
  const r = result as { isError?: boolean; content?: { type?: string; text?: string }[] } | undefined;
  const text = r?.content?.find(c => c?.type === 'text')?.text ?? '';
  const first = text.split('\n').find(line => line.trim() !== '')?.trim();
  if (r?.isError) return { ok: false, outcome: first ? clip(text.trim(), MAX_OUTCOME) : 'Failed' };
  return { ok: true, outcome: first ? clip(first, MAX_OUTCOME) : undefined };
}

/**
 * An activity event from the relay, checked and cut to size, or null. The
 * body comes over the control plane, which only the relay can reach with
 * the token; it is still checked, since the app renders it.
 */
export function readActivity(body: unknown): AgentActivity | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return null;
  const { id, tool, phase, at, summary, detail, ok, outcome } = b;
  if (typeof id !== 'string' || !id || id.length > MAX_ID) return null;
  if (typeof tool !== 'string' || !/^[a-z_]{1,40}$/.test(tool)) return null;
  if (phase !== 'start' && phase !== 'end') return null;
  if (typeof at !== 'number' || !Number.isFinite(at)) return null;
  if (typeof summary !== 'string') return null;
  return {
    id,
    tool,
    phase,
    at,
    summary: clip(summary, MAX_SUMMARY),
    ...(typeof detail === 'string' && detail ? { detail: clip(detail, MAX_DETAIL) } : {}),
    ...(typeof ok === 'boolean' ? { ok } : {}),
    ...(typeof outcome === 'string' && outcome ? { outcome: clip(outcome, MAX_OUTCOME) } : {}),
  };
}
