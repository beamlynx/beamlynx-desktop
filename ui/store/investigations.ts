import { makeAutoObservable, observable, toJS } from 'mobx';
import type { AgentActivity } from '../desktop';
import { DEFAULT_INVESTIGATION, STALE_MS } from './agent-activity';
import type { AccessPolicyModule, ColumnPolicy } from './client';
import type { PolicyProposal } from '../desktop';
import type { ColumnMetadata, ResultColumn, Row, Session } from './session';

/**
 * An investigation is everything one Claude session does through beamlynx
 * (see beamlynx-desktop's src/main/mcp/investigations.ts). It has a tab of
 * its own, and this timeline: every step, with what the agent saw.
 */

/** A query's result as its tab showed it, to show again without running anything. */
export type QuerySnapshot = {
  expression: string;
  columns: ResultColumn[];
  rows: Row[];
  columnMetadata: ColumnMetadata;
  columnVisibilityModel: Record<string, boolean>;
  error: string;
  // How many rows the run returned, when only the first of them are kept
  // (keepSnapshotsSmall).
  rowsDropped?: number;
};

/**
 * How many rows a step keeps of what the agent saw, to show again. A
 * timeline of big results was all kept, for as long as the app ran. The
 * newest steps keep more, since they are the ones looked at again.
 */
export const SNAPSHOT_ROWS = 500;
export const OLD_SNAPSHOT_ROWS = 50;
export const FULL_SNAPSHOTS = 20;

function keepRows(snapshot: QuerySnapshot, max: number): QuerySnapshot {
  if (snapshot.rows.length <= max) return snapshot;
  return {
    ...snapshot,
    rows: snapshot.rows.slice(0, max),
    rowsDropped: (snapshot.rowsDropped ?? 0) + snapshot.rows.length - max,
  };
}

/**
 * A copy of what a tab shows after a run. Plain data, so later runs can't
 * change it. A failed run keeps no rows: the grid still holds the previous
 * run's, which aren't this step's. The expression is the one that ran; a
 * failed run doesn't move expressionAtLastEval.
 */
export function snapshotOf(session: Session): QuerySnapshot {
  const failed = !!session.error;
  return {
    expression: session.expression,
    columns: failed ? [] : toJS(session.columns),
    rows: failed ? [] : toJS(session.rows),
    columnMetadata: toJS(session.columnMetadata),
    columnVisibilityModel: toJS(session.columnVisibilityModel),
    error: session.error,
  };
}


/** The column a query was refused for, as pine-lang names it (`hidden-column`). */
export type HiddenColumn = ColumnPolicy & { alias?: string; column: string };

export type InvestigationStep =
  // A tool call that isn't a query: a search, a completion, a doc.
  | {
      id: string;
      kind: 'call';
      tool: string;
      summary: string;
      detail?: string;
      at: number;
      endedAt?: number;
      ok?: boolean;
      outcome?: string;
    }
  // A query, run by the agent or by the user in this tab.
  | {
      id: string;
      kind: 'query';
      by: 'agent' | 'user';
      at: number;
      // The Pine. Empty until an agent's SQL has converted, and for good if
      // it didn't.
      expression: string;
      // The SQL an agent sent with run_sql_as_pine. It is never shown as
      // Pine, and never put in the tab.
      sql?: string;
      reason?: string;
      running: boolean;
      rowCount?: number;
      error?: string;
      // None when nothing ran in the tab, so there is nothing to show again.
      snapshot?: QuerySnapshot;
    }
  | { id: string; kind: 'finding'; at: number; text: string }
  // The agent proposing a change to its connection's access policy
  // (propose_policy_change), waiting for the user to apply or decline it.
  | {
      id: string;
      kind: 'proposal';
      at: number;
      proposal: PolicyProposal;
      // expired: the agent's call stopped waiting (beamlynx-desktop's
      // PROPOSAL_EXPIRY_MS) before anyone answered. undone: applied, then
      // put back by the user.
      status: 'pending' | 'applied' | 'declined' | 'expired' | 'undone';
      // The policy's rules before Apply, for Undo.
      before?: AccessPolicyModule[];
      // The rules as Apply left them. Undo puts `before` back only while
      // the policy still has exactly these, or it would erase a later edit.
      after?: AccessPolicyModule[];
      // Applied after the agent's call stopped waiting, so it wasn't told.
      agentGone?: boolean;
    }
  // A note the user wrote to the agent.
  | { id: string; kind: 'note'; at: number; text: string; delivered: boolean }
  // The agent asking to see a query's real values (request_reveal). The
  // query runs once, read-only and unmasked, for the user to look at:
  // `preview`, and `rows`, the run's rows as Approve sends them.
  | {
      id: string;
      kind: 'reveal';
      at: number;
      requestId: string;
      expression: string;
      reason?: string;
      // expired: the agent stopped waiting before anyone answered.
      status: 'running' | 'pending' | 'revealed' | 'declined' | 'expired';
      preview?: QuerySnapshot;
      rows?: unknown;
      // Why it was declined without asking, such as a query that changes data.
      note?: string;
    };

// These tools are shown as the query they ran, or as the question and
// findings they carry. Their activity events add nothing else.
const QUERY_TOOLS = new Set(['run_query', 'run_sql_as_pine', 'propose_policy_change']);
// Waiting is shown as the proposal or reveal it waits on.
const QUIET_TOOLS = new Set(['check_reveal']);


export { DEFAULT_INVESTIGATION };

/**
 * The reason an agent gave for a query: its leading comment, as it writes
 * one per the MCP instructions (`/* ... *\/` or `-- ...`).
 */
export function queryReason(expression: string): string | undefined {
  const block = expression.match(/^\s*\/\*([\s\S]*?)\*\//);
  const line = expression.match(/^\s*--(.*)/);
  const text = (block?.[1] ?? line?.[1])?.replace(/\s+/g, ' ').trim();
  return text || undefined;
}

let counter = 0;
const stepId = () => `step-${Date.now()}-${++counter}`;

// A step's result data stays plain: MobX would otherwise make every row of
// every result observable, which is slow for big ones and was never needed.
// A new value is still noticed, as a whole.
const newStep = <T extends InvestigationStep>(value: T): T =>
  observable(value, {
    snapshot: observable.ref,
    preview: observable.ref,
    rows: observable.ref,
    proposal: observable.ref,
    before: observable.ref,
    after: observable.ref,
  } as Record<string, typeof observable.ref>);

/**
 * Runs tasks one at a time, in the order they came. An investigation's
 * queries share its one tab, so two at once would each read the other's
 * columns, rows and error. A task that fails doesn't stop the ones after it.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/** Whether a tool call has had no end for too long to still be going (AgentActivityStore's STALE_MS). */
export const isStaleCall = (step: { at: number; endedAt?: number }, now: number) =>
  step.endedAt === undefined && now - step.at >= STALE_MS;

export class Investigation {
  // Each field starts with a value, even undefined: the build doesn't emit
  // a field without one, and MobX only observes fields that exist.
  question: string | undefined = undefined;
  steps: InvestigationStep[] = [];
  lastCallAt: number | undefined = undefined;
  // The step shown in the tab, when the user picked an older one. null
  // follows the newest query.
  selectedStepId: string | null = null;
  // Whether its tab is in the strip. It isn't until the user opens it from
  // the robot; closing it only hides it again, and the investigation goes on.
  tabOpen = false;
  // The agent's queries, one at a time (SerialQueue).
  readonly queue = new SerialQueue();

  constructor(
    readonly id: string,
    readonly sessionId: string,
  ) {
    makeAutoObservable(this, { id: false, sessionId: false, queue: false });
  }

  /** Takes in a tool call's start or end (see beamlynx-desktop's activity.ts). */
  apply(event: AgentActivity) {
    this.lastCallAt = Math.max(this.lastCallAt ?? 0, event.at);
    if (event.tool === 'set_question') {
      if (event.phase === 'start' && event.detail) this.question = event.detail;
      return;
    }
    if (event.tool === 'note_finding') {
      if (event.phase === 'start' && event.detail) {
        this.steps.push(newStep({ id: `finding-${event.id}`, kind: 'finding', at: event.at, text: event.detail }));
      }
      return;
    }
    if (QUERY_TOOLS.has(event.tool) || QUIET_TOOLS.has(event.tool)) return;
    const existing = this.steps.find(s => s.kind === 'call' && s.id === event.id);
    if (event.phase === 'start') {
      if (existing) return;
      this.steps.push(
        newStep({
          id: event.id,
          kind: 'call',
          tool: event.tool,
          summary: event.summary,
          detail: event.detail,
          at: event.at,
        }),
      );
    } else if (existing && existing.kind === 'call') {
      existing.endedAt = event.at;
      existing.ok = event.ok;
      existing.outcome = event.outcome;
    } else {
      // The start was missed, such as when the call itself opened the app.
      this.steps.push(
        newStep({
          id: event.id,
          kind: 'call',
          tool: event.tool,
          summary: event.summary,
          detail: event.detail,
          at: event.at,
          endedAt: event.at,
          ok: event.ok,
          outcome: event.outcome,
        }),
      );
    }
  }

  startQuery(expression: string, by: 'agent' | 'user', sql?: string): string {
    const id = stepId();
    this.steps.push(
      newStep({
        id,
        kind: 'query',
        by,
        at: Date.now(),
        expression: sql === undefined ? expression : '',
        ...(sql === undefined ? {} : { sql }),
        reason: queryReason(sql ?? expression),
        running: true,
        snapshot: undefined,
      }),
    );
    if (by === 'agent') this.selectedStepId = null;
    return id;
  }

  finishQuery(id: string, snapshot: QuerySnapshot) {
    const query = this.steps.find(s => s.id === id);
    if (!query || query.kind !== 'query') return;
    query.running = false;
    query.expression = snapshot.expression || query.expression;
    query.reason = queryReason(query.expression) ?? query.reason;
    // Counted before any rows are dropped.
    query.rowCount = snapshot.error ? undefined : snapshot.rows.length;
    query.snapshot = keepRows(snapshot, SNAPSHOT_ROWS);
    query.error = snapshot.error || undefined;
    this.keepSnapshotsSmall();
  }

  /** Steps older than the newest FULL_SNAPSHOTS keep only their first OLD_SNAPSHOT_ROWS rows. */
  private keepSnapshotsSmall() {
    let seen = 0;
    for (let i = this.steps.length - 1; i >= 0; i--) {
      const s = this.steps[i];
      if (s.kind !== 'query' || !s.snapshot) continue;
      if (++seen > FULL_SNAPSHOTS) s.snapshot = keepRows(s.snapshot, OLD_SNAPSHOT_ROWS);
    }
  }

  /** A query that ran nothing in the tab, such as SQL that didn't convert. */
  failQuery(id: string, error: string) {
    const query = this.steps.find(s => s.id === id);
    if (!query || query.kind !== 'query') return;
    query.running = false;
    query.error = error;
  }

  addProposal(proposal: PolicyProposal): void {
    if (this.proposal(proposal.id)) return;
    this.steps.push(
      newStep({
        id: `proposal-${proposal.id}`,
        kind: 'proposal',
        at: Date.now(),
        proposal: toJS(proposal),
        status: 'pending',
        before: undefined,
        after: undefined,
      }),
    );
  }

  proposal(proposalId: string) {
    const step = this.steps.find(s => s.kind === 'proposal' && s.proposal.id === proposalId);
    return step?.kind === 'proposal' ? step : undefined;
  }

  setProposal(
    proposalId: string,
    status: 'applied' | 'declined' | 'expired' | 'undone',
    rules?: { before: AccessPolicyModule[]; after: AccessPolicyModule[] },
  ) {
    const card = this.proposal(proposalId);
    if (!card) return;
    // Only a pending card is answered, or expires: an answer after the
    // agent stopped waiting is no answer. Only an applied one is undone.
    if (status === 'undone' ? card.status !== 'applied' : card.status !== 'pending') return;
    card.status = status;
    if (rules) {
      card.before = rules.before;
      card.after = rules.after;
    }
  }

  /** Applied, but the agent's call had stopped waiting, so it wasn't told. */
  markProposalAgentGone(proposalId: string) {
    const card = this.proposal(proposalId);
    if (card) card.agentGone = true;
  }

  /** A new card, or false when this request already has one (the desktop app sends it again after a reload). */
  addReveal(requestId: string, expression: string, reason: string | undefined): boolean {
    if (this.reveal(requestId)) return false;
    this.steps.push(
      newStep({
        id: stepId(),
        kind: 'reveal',
        at: Date.now(),
        requestId,
        expression,
        reason,
        status: 'running',
        preview: undefined,
        rows: undefined,
      }),
    );
    return true;
  }

  /** The reveal's read-only run is done: ready for the user's decision, or declined already. */
  setRevealPreview(requestId: string, preview: QuerySnapshot, rows: unknown) {
    const card = this.reveal(requestId);
    if (card?.status !== 'running') return;
    card.preview = preview;
    card.rows = rows;
    card.status = 'pending';
  }

  setReveal(requestId: string, status: 'revealed' | 'declined' | 'expired', note?: string) {
    const card = this.reveal(requestId);
    if (!card || card.status === 'revealed' || card.status === 'declined' || card.status === 'expired') return;
    card.status = status;
    if (note) card.note = note;
    // Approve sent the rows, or nothing will: they needn't be kept.
    card.rows = undefined;
  }

  reveal(requestId: string) {
    const step = this.steps.find(s => s.kind === 'reveal' && s.requestId === requestId);
    return step?.kind === 'reveal' ? step : undefined;
  }

  addNote(id: string, text: string) {
    this.steps.push(newStep({ id, kind: 'note', at: Date.now(), text, delivered: false }));
  }

  markDelivered(ids: string[]) {
    for (const step of this.steps) {
      if (step.kind === 'note' && ids.includes(step.id)) step.delivered = true;
    }
  }

  setTabOpen(open: boolean) {
    this.tabOpen = open;
  }

  select(stepId: string | null) {
    this.selectedStepId = stepId;
  }

  /** The newest query with a result: what the tab shows when following. */
  get latestQuery() {
    for (let i = this.steps.length - 1; i >= 0; i--) {
      const s = this.steps[i];
      if (s.kind === 'query' && s.snapshot) return s;
    }
    return undefined;
  }

  /** Everything the agent is waiting on the user for: proposals and reveal requests. */
  get pendingDecisions() {
    return this.steps.filter(
      s =>
        (s.kind === 'proposal' && s.status === 'pending') ||
        (s.kind === 'reveal' && (s.status === 'pending' || s.status === 'running')),
    );
  }
}
