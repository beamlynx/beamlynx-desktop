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
  /** On `end` of a query that returned rows: how many. Never the rows. */
  rows?: number;
  /** The saved connection the call used, when it named one. */
  connectionId?: string;
  /** The question the agent says it is working on (set_question, or a call's `question`). */
  question?: string;
  /** What the agent says it found (note_finding, or a call's `finding`). */
  finding?: string;
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
    case 'get_access_policy':
      return { summary: 'Reading the access policy' };
    case 'propose_policy_change':
      return { summary: 'Proposing a change to the access policy', detail: text('reason') };
    case 'set_question':
      return { summary: 'Naming the question it is investigating', detail: text('question') };
    case 'note_finding':
      return { summary: 'Noting what it found', detail: text('finding') };
    default:
      return { summary: `Calling ${tool}` };
  }
}

/**
 * What a call is about, from its arguments: the connection it used, and the
 * question or finding the agent stated. Saved with the call
 * (agent-log.ts), so a retro can tell sessions and databases apart.
 */
export function callContext(args: Record<string, unknown>): Pick<AgentActivity, 'connectionId' | 'question' | 'finding'> {
  const text = (key: string, max: number) =>
    typeof args[key] === 'string' && (args[key] as string).trim() ? clip((args[key] as string).trim(), max) : undefined;
  const connectionId = text('connection_id', MAX_ID);
  const question = text('question', MAX_DETAIL);
  const finding = text('finding', MAX_DETAIL);
  return {
    ...(connectionId ? { connectionId } : {}),
    ...(question ? { question } : {}),
    ...(finding ? { finding } : {}),
  };
}

// format.ts's formatRows starts a result with "N rows" (or "N rows, showing
// the first M"), or "No rows.", after any "Ran as Pine:" lines.
const ROW_COUNT = /^(\d+) rows?\b/m;

/** How a tool's result went: an MCP result says it failed with `isError`, it doesn't throw. */
export function outcomeOf(result: unknown): { ok: boolean; outcome?: string; rows?: number } {
  const r = result as { isError?: boolean; content?: { type?: string; text?: string }[] } | undefined;
  const text = r?.content?.find(c => c?.type === 'text')?.text ?? '';
  const first = text.split('\n').find(line => line.trim() !== '')?.trim();
  if (r?.isError) return { ok: false, outcome: first ? clip(text.trim(), MAX_OUTCOME) : 'Failed' };
  const count = ROW_COUNT.exec(text);
  const rows = count ? Number(count[1]) : /^No rows\.$/m.test(text) ? 0 : undefined;
  return { ok: true, outcome: first ? clip(first, MAX_OUTCOME) : undefined, ...(rows !== undefined ? { rows } : {}) };
}

/**
 * An activity event from the relay, checked and cut to size, or null. The
 * body comes over the control plane, which only the relay can reach with
 * the token; it is still checked, since the app renders it.
 */
export function readActivity(body: unknown): AgentActivity | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return null;
  const { id, tool, phase, at, summary, detail, ok, outcome, rows, connectionId, question, finding } = b;
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
    ...(typeof rows === 'number' && Number.isInteger(rows) && rows >= 0 ? { rows } : {}),
    ...(typeof connectionId === 'string' && connectionId && connectionId.length <= MAX_ID ? { connectionId } : {}),
    ...(typeof question === 'string' && question ? { question: clip(question, MAX_DETAIL) } : {}),
    ...(typeof finding === 'string' && finding ? { finding: clip(finding, MAX_DETAIL) } : {}),
  };
}
