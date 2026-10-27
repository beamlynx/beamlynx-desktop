import { makeAutoObservable } from 'mobx';
import type { AgentActivity } from '../desktop';

/**
 * What an AI agent is doing, for the person watching: every MCP tool call,
 * from its start to its end. beamlynx-desktop reports each one (its
 * src/main/mcp/activity.ts), including calls that never reach a tab, like
 * looking up a table or reading the Pine reference. So the app shows an
 * agent is working before its first query lands.
 *
 * Display only. Nothing here runs anything, and it stays out of
 * mcp-query.ts, which the no-raw-SQL test reads.
 */
/** Investigations from a relay too old to send an id share this one (store/investigations.ts). */
export const DEFAULT_INVESTIGATION = 'default';

export type AgentActivityEntry = {
  id: string;
  // The investigation the call belongs to (store/investigations.ts).
  investigationId: string;
  tool: string;
  summary: string;
  detail?: string;
  startedAt: number;
  /** Unset while the call runs. */
  endedAt?: number;
  ok?: boolean;
  outcome?: string;
};

/** How many calls the log keeps, newest first. */
export const MAX_ENTRIES = 100;
/**
 * A call with no end after this long is taken as over: the agent's
 * connection went away mid-call. The longest a call waits on the app is the
 * relay's 35 s request timeout.
 */
export const STALE_MS = 60_000;
/**
 * An agent spends most of its time thinking between calls, and most calls
 * end in milliseconds. So it counts as working until this long after its
 * last call ends, not only while a call is in flight.
 */
export const LINGER_MS = 20_000;
// Waiting for the person isn't the agent working: a pending proposal or
// reveal has its own badge.
const WAITING_TOOLS = new Set(['check_reveal', 'propose_policy_change']);

export class AgentActivityStore {
  entries: AgentActivityEntry[] = [];
  /** The clock `running` is read against, moved on by tick(). */
  now = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    makeAutoObservable<AgentActivityStore, 'timer'>(this, { timer: false });
  }

  /** One event from the desktop app: a call starting or ending. */
  apply(event: AgentActivity) {
    this.now = Math.max(this.now, Date.now());
    const entry = this.entries.find(e => e.id === event.id);
    if (event.phase === 'start') {
      if (entry) return;
      this.entries.unshift({
        id: event.id,
        investigationId: event.investigationId ?? DEFAULT_INVESTIGATION,
        tool: event.tool,
        summary: event.summary,
        detail: event.detail,
        startedAt: event.at,
      });
      if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES;
    } else if (entry) {
      entry.endedAt = event.at;
      entry.ok = event.ok;
      entry.outcome = event.outcome;
    } else {
      // The start was missed, e.g. the call itself opened the app.
      this.entries.unshift({
        ...event,
        investigationId: event.investigationId ?? DEFAULT_INVESTIGATION,
        startedAt: event.at,
        endedAt: event.at,
      });
      if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES;
    }
    this.keepTicking();
  }

  /** Calls still going, newest first. */
  get running(): AgentActivityEntry[] {
    return this.entries.filter(e => e.endedAt === undefined && this.now - e.startedAt < STALE_MS);
  }

  /** When the agent's last call ended, not counting waits on the person. */
  get lastEndedAt(): number | undefined {
    const ends = this.entries
      .filter(e => e.endedAt !== undefined && !WAITING_TOOLS.has(e.tool))
      .map(e => e.endedAt!);
    return ends.length > 0 ? Math.max(...ends) : undefined;
  }

  /** Whether a call ended recently enough that the agent is likely thinking about its next one. */
  get lingering(): boolean {
    const last = this.lastEndedAt;
    return last !== undefined && this.now - last < LINGER_MS;
  }

  /**
   * Whether the agent is doing something right now, not just waiting on the
   * person: a call in flight, or one that ended under LINGER_MS ago.
   */
  get working(): boolean {
    return this.running.some(e => !WAITING_TOOLS.has(e.tool)) || this.lingering;
  }

  /** The newest call still going, for a one-line status. */
  get current(): AgentActivityEntry | undefined {
    return this.running.find(e => !WAITING_TOOLS.has(e.tool)) ?? this.running[0];
  }

  /**
   * The same as working and current, for one investigation's agent: each
   * investigation's tab says what its own agent is doing, while several
   * work at once.
   */
  workingFor(investigationId: string): boolean {
    const own = this.entries.filter(e => e.investigationId === investigationId);
    const running = own.some(
      e => e.endedAt === undefined && this.now - e.startedAt < STALE_MS && !WAITING_TOOLS.has(e.tool),
    );
    const ended = own.filter(e => e.endedAt !== undefined && !WAITING_TOOLS.has(e.tool)).map(e => e.endedAt!);
    return running || (ended.length > 0 && this.now - Math.max(...ended) < LINGER_MS);
  }

  currentFor(investigationId: string): AgentActivityEntry | undefined {
    const running = this.running.filter(e => e.investigationId === investigationId);
    return running.find(e => !WAITING_TOOLS.has(e.tool)) ?? running[0];
  }

  /** Whether a call ran too long to still be going. */
  isStale(entry: AgentActivityEntry): boolean {
    return entry.endedAt === undefined && this.now - entry.startedAt >= STALE_MS;
  }

  clear() {
    this.entries = [];
  }

  tick(now = Date.now()) {
    this.now = now;
    if (this.running.length === 0 && !this.lingering) this.stopTicking();
  }

  // The clock only moves while a call runs or just ended, so a call that
  // never ends stops counting as running, the agent stops counting as
  // working after LINGER_MS, and nothing ticks when the agent is idle.
  private keepTicking() {
    if (
      this.timer ||
      (this.running.length === 0 && !this.lingering) ||
      typeof setInterval === 'undefined'
    )
      return;
    this.timer = setInterval(() => this.tick(), 1000);
    // Node's timers keep a process alive (the tests); a browser's are numbers.
    (this.timer as { unref?: () => void }).unref?.();
  }

  private stopTicking() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
