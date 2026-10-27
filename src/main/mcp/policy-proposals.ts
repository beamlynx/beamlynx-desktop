// An agent's proposed change to its connection's access policy
// (propose_policy_change in stdio-relay.ts). Nothing here writes a policy:
// a proposal is checked against the connection's own policy, kept in this
// process's memory, and shown to the user as a card in the agent's
// investigation. Only the renderer applies it, through the same
// access-policy IPC as Settings, after the user clicks Apply. Then it says
// so with resolveProposal, and the agent's waiting call returns.
//
// Kept free of Electron, so it can be tested on its own. See
// beamlynx-plans/pending/2026-10-21-per-connection-policies-and-agent-proposals.md.
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import type { AccessPolicy, AccessPolicyModule, AccessPolicyRule, ColumnMatcher } from '../credential-store';

export type PolicyChange =
  | { add: AccessPolicyRule }
  | { remove: string }
  | { enable: string }
  | { disable: string };

export type PolicyProposal = {
  id: string;
  investigationId?: string;
  profileId: string;
  // The connection's own policy the changes were checked against.
  policyId: string;
  reason: string;
  changes: PolicyChange[];
};

export type ProposalOutcome = { applied: true } | { applied: false; comment?: string };

const MAX_CHANGES = 20;
const MAX_TEXT = 200;
const MAX_REASON = 2000;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() && value.length <= MAX_TEXT ? value.trim() : null;

// A matcher rebuilt from what the agent sent, keeping only the fields a
// matcher has. Null if it isn't one.
function matcherOf(raw: unknown): ColumnMatcher | null {
  const m = raw as Record<string, unknown> | null;
  if (!m || typeof m !== 'object') return null;
  switch (m.type) {
    case 'foreign-key':
      return { type: 'foreign-key' };
    case 'column-type': {
      const allow = Array.isArray(m.allow) ? m.allow.map(text) : [];
      if (!allow.length || allow.length > 50 || allow.some(t => t === null)) return null;
      return { type: 'column-type', allow: allow as string[] };
    }
    case 'column-name': {
      const kinds = (['suffix', 'contains', 'equals'] as const).filter(k => m[k] !== undefined);
      const value = kinds.length === 1 ? text(m[kinds[0]]) : null;
      return value ? { type: 'column-name', [kinds[0]]: value } : null;
    }
    case 'column': {
      const table = text(m.table);
      const column = text(m.column);
      const schema = m.schema === undefined || m.schema === null ? null : text(m.schema);
      if (!table || !column || (m.schema != null && !schema)) return null;
      return { type: 'column', schema, table, column };
    }
    default:
      return null;
  }
}

function ruleOf(raw: unknown): AccessPolicyRule | null {
  const r = raw as Record<string, unknown> | null;
  if (r?.type === 'hide') {
    const match = matcherOf(r.match);
    return match ? { type: 'hide', match } : null;
  }
  return matcherOf(raw);
}

const plain = (m: AccessPolicyModule): AccessPolicyRule => {
  const { id: _id, enabled: _enabled, builtIn: _builtIn, ...rule } = m;
  return rule as AccessPolicyRule;
};

/**
 * The changes, checked against the connection's own policy, or why they
 * can't be proposed. Refuses an unknown rule id, removing a built-in rule,
 * a malformed rule, and a set of changes that would leave no rule on: the
 * agent would be locked out of the connection.
 */
export function checkChanges(
  policy: AccessPolicy | null,
  raw: unknown,
): { changes: PolicyChange[] } | { error: string } {
  if (!policy) {
    return { error: 'Agents already see every column on this connection, so there is nothing to change.' };
  }
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'changes must be a list of at least one change.' };
  if (raw.length > MAX_CHANGES) return { error: `At most ${MAX_CHANGES} changes in one proposal.` };
  const byId = new Map(policy.rules.map(m => [m.id, m]));
  const enabled = new Map(policy.rules.map(m => [m.id, m.enabled]));
  let added = 0;
  const changes: PolicyChange[] = [];
  for (const [i, item] of raw.entries()) {
    const c = item as Record<string, unknown> | null;
    const keys = c && typeof c === 'object' ? Object.keys(c) : [];
    if (keys.length !== 1) return { error: `Change ${i + 1} must have exactly one of add, remove, enable or disable.` };
    const [key] = keys;
    if (key === 'add') {
      const rule = ruleOf(c!.add);
      if (!rule) return { error: `Change ${i + 1}: not a rule beamlynx knows. See the rule shapes in the tool's description.` };
      // Adding a rule the policy has turns it on (credential-store.ts).
      const existing = policy.rules.find(m => JSON.stringify(plain(m)) === JSON.stringify(rule));
      if (existing) enabled.set(existing.id, true);
      else added++;
      changes.push({ add: rule });
      continue;
    }
    if (key !== 'remove' && key !== 'enable' && key !== 'disable') {
      return { error: `Change ${i + 1}: "${key}" isn't a change. Use add, remove, enable or disable.` };
    }
    const id = c![key];
    const module = typeof id === 'string' ? byId.get(id) : undefined;
    if (!module) return { error: `Change ${i + 1}: there is no rule with id ${JSON.stringify(id)}. get_access_policy lists them.` };
    if (key === 'remove' && module.builtIn) {
      return { error: `Change ${i + 1}: rule ${module.id} is built in and can't be removed. Propose disable instead.` };
    }
    if (key === 'remove') enabled.delete(module.id);
    else enabled.set(module.id, key === 'enable');
    changes.push({ [key]: module.id } as PolicyChange);
  }
  if (added === 0 && ![...enabled.values()].some(Boolean)) {
    return { error: 'After these changes no rule would be on, and agents could no longer use this connection.' };
  }
  return { changes };
}

// --- Waiting proposals ---------------------------------------------------

// Like investigations.ts's approvals: in memory, gone on restart. An
// outcome is kept until the agent's call collects it.
const proposals = new Map<string, PolicyProposal>();
const outcomes = new Map<string, ProposalOutcome>();
const resolved = new EventEmitter();
resolved.setMaxListeners(50);

export function createProposal(input: Omit<PolicyProposal, 'id' | 'reason'> & { reason: unknown }): PolicyProposal {
  const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, MAX_REASON) : '';
  const proposal = { ...input, reason, id: randomUUID() };
  proposals.set(proposal.id, proposal);
  return proposal;
}

/** Every proposal still on offer. Re-sent when the window reloads. */
export function listPendingProposals(): PolicyProposal[] {
  return [...proposals.values()];
}

export function countPendingProposals(profileId: string): number {
  return [...proposals.values()].filter(p => p.profileId === profileId).length;
}

/** The user's answer. False for a proposal nobody is waiting on. */
export function resolveProposal(id: string, outcome: ProposalOutcome): boolean {
  if (!proposals.has(id)) return false;
  proposals.delete(id);
  outcomes.set(id, outcome);
  resolved.emit(id, outcome);
  return true;
}

/**
 * The user's answer once there is one, or 'pending' after timeoutMs, or
 * 'unknown' for an id this process doesn't know. The agent's call asks
 * again while it is pending.
 */
export function waitForProposal(id: string, timeoutMs: number): Promise<ProposalOutcome | 'pending' | 'unknown'> {
  const known = outcomes.get(id);
  if (known) {
    outcomes.delete(id);
    return Promise.resolve(known);
  }
  if (!proposals.has(id)) return Promise.resolve('unknown');
  return new Promise(resolve => {
    const onResolve = (outcome: ProposalOutcome) => {
      clearTimeout(timer);
      outcomes.delete(id);
      resolve(outcome);
    };
    const timer = setTimeout(() => {
      resolved.off(id, onResolve);
      resolve('pending');
    }, timeoutMs);
    resolved.once(id, onResolve);
  });
}

/**
 * A proposal the user didn't answer in time, or the agent stopped waiting
 * for: no card should still offer it. True if it was still on offer.
 */
export function expireProposal(id: string): boolean {
  return proposals.delete(id);
}

// --- The agent's side ----------------------------------------------------

/** A control-plane request, as stdio-relay.ts makes them. */
export type ControlPlaneRequest = (
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
  options?: { timeoutMs?: number; signal?: AbortSignal },
) => Promise<any>;

const CANCELLED_TEXT = 'You cancelled the call, so the proposed policy change was withdrawn.';

/**
 * propose_policy_change's call: sends the proposal, then waits for the
 * user's answer until the deadline. Returns the text for the agent, and
 * whether it failed.
 *
 * `signal` is the MCP client's cancel. It stops the wait and withdraws the
 * proposal, so its card stops offering it.
 */
export async function proposeAndWait(
  request: ControlPlaneRequest,
  body: { profileId: string; reason: string; changes: unknown },
  timeoutMs: number,
  now: () => number = Date.now,
  signal?: AbortSignal,
): Promise<{ text: string; isError: boolean }> {
  const deadline = now() + timeoutMs;
  const created = await request('POST', '/policy-proposal', body, { signal });
  const id = created?.proposalId;
  if (typeof id !== 'string') return { isError: true, text: created?.error ?? "The proposal wasn't accepted." };
  const withdraw = () =>
    request('DELETE', `/policy-proposal/${encodeURIComponent(id)}`, undefined, { timeoutMs: 2000 }).catch(
      () => undefined,
    );
  while (now() < deadline) {
    if (signal?.aborted) {
      await withdraw();
      return { isError: true, text: CANCELLED_TEXT };
    }
    let answer;
    try {
      answer = await request('GET', `/policy-proposal/${encodeURIComponent(id)}`, undefined, { signal });
    } catch (e) {
      if (!signal?.aborted) throw e;
      await withdraw();
      return { isError: true, text: CANCELLED_TEXT };
    }
    if (answer?.status === 'applied') {
      return { isError: false, text: 'The user applied your changes to the access policy. Run your query again.' };
    }
    if (answer?.status === 'declined') {
      const comment = typeof answer.comment === 'string' && answer.comment.trim();
      return { isError: true, text: 'The user declined your proposed policy change' + (comment ? `: "${comment}"` : '.') };
    }
    if (answer?.status !== 'pending') break;
  }
  return {
    isError: true,
    text: "The user didn't answer your proposed policy change in time, so it was withdrawn. Carry on without it, or propose it again if you still need it.",
  };
}
