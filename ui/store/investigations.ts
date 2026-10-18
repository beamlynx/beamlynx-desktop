import { makeAutoObservable, toJS } from 'mobx';
import type { AgentActivity } from '../desktop';
import type { ColumnPolicy } from './client';
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
};

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

/** A step that ran nothing in the tab, such as SQL that didn't convert. */
export function emptySnapshot(expression: string, error: string): QuerySnapshot {
  return {
    expression,
    columns: [],
    rows: [],
    columnMetadata: { colIndexToAliasLookup: {}, aliasToKeyLookup: {}, colIndexToColumnLookup: {}, colIndexToPathLookup: {}, colIndexToPolicyLookup: {} },
    columnVisibilityModel: {},
    error,
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
      expression: string;
      reason?: string;
      running: boolean;
      rowCount?: number;
      error?: string;
      snapshot?: QuerySnapshot;
    }
  | { id: string; kind: 'finding'; at: number; text: string }
  // A query waiting on the user to allow a hidden column.
  | {
      id: string;
      kind: 'approval';
      at: number;
      approvalId: string;
      column: HiddenColumn;
      reason?: string;
      status: 'pending' | 'allowed' | 'declined';
    }
  // A note the user wrote to the agent.
  | { id: string; kind: 'note'; at: number; text: string; delivered: boolean };

// These tools are shown as the query they ran, or as the question and
// findings they carry. Their activity events add nothing else.
const QUERY_TOOLS = new Set(['run_query', 'run_sql_as_pine']);
// Waiting is shown as the approval or reveal it waits on.
const QUIET_TOOLS = new Set(['check_reveal']);

/** Investigations from a relay too old to send an id share this one. */
export const DEFAULT_INVESTIGATION = 'default';

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

export class Investigation {
  question?: string;
  steps: InvestigationStep[] = [];
  lastCallAt?: number;
  // The step shown in the tab, when the user picked an older one. null
  // follows the newest query.
  selectedStepId: string | null = null;

  constructor(
    readonly id: string,
    readonly sessionId: string,
  ) {
    makeAutoObservable(this, { id: false, sessionId: false });
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
        this.steps.push({ id: `finding-${event.id}`, kind: 'finding', at: event.at, text: event.detail });
      }
      return;
    }
    if (QUERY_TOOLS.has(event.tool) || QUIET_TOOLS.has(event.tool)) return;
    const existing = this.steps.find(s => s.kind === 'call' && s.id === event.id);
    if (event.phase === 'start') {
      if (existing) return;
      this.steps.push({
        id: event.id,
        kind: 'call',
        tool: event.tool,
        summary: event.summary,
        detail: event.detail,
        at: event.at,
      });
    } else if (existing && existing.kind === 'call') {
      existing.endedAt = event.at;
      existing.ok = event.ok;
      existing.outcome = event.outcome;
    }
  }

  startQuery(expression: string, by: 'agent' | 'user'): string {
    const id = stepId();
    this.steps.push({
      id,
      kind: 'query',
      by,
      at: Date.now(),
      expression,
      reason: queryReason(expression),
      running: true,
    });
    if (by === 'agent') this.selectedStepId = null;
    return id;
  }

  finishQuery(id: string, snapshot: QuerySnapshot) {
    const step = this.steps.find(s => s.id === id);
    if (!step || step.kind !== 'query') return;
    step.running = false;
    step.expression = snapshot.expression || step.expression;
    step.reason = queryReason(step.expression) ?? step.reason;
    step.snapshot = snapshot;
    step.error = snapshot.error || undefined;
    step.rowCount = snapshot.error ? undefined : snapshot.rows.length;
  }

  addApproval(approvalId: string, column: HiddenColumn, reason: string | undefined): string {
    const id = stepId();
    this.steps.push({ id, kind: 'approval', at: Date.now(), approvalId, column, reason, status: 'pending' });
    return id;
  }

  setApproval(approvalId: string, status: 'allowed' | 'declined') {
    const step = this.steps.find(s => s.kind === 'approval' && s.approvalId === approvalId);
    if (step && step.kind === 'approval') step.status = status;
  }

  addNote(id: string, text: string) {
    this.steps.push({ id, kind: 'note', at: Date.now(), text, delivered: false });
  }

  markDelivered(ids: string[]) {
    for (const step of this.steps) {
      if (step.kind === 'note' && ids.includes(step.id)) step.delivered = true;
    }
  }

  select(stepId: string | null) {
    this.selectedStepId = stepId;
  }

  /** The newest query with a result: what the tab shows when following. */
  get latestQuery() {
    for (let i = this.steps.length - 1; i >= 0; i--) {
      const step = this.steps[i];
      if (step.kind === 'query' && step.snapshot) return step;
    }
    return undefined;
  }

  get pendingApprovals() {
    return this.steps.filter(s => s.kind === 'approval' && s.status === 'pending');
  }
}
