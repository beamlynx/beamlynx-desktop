// Backs the MCP `request_reveal`/`check_reveal` tool pair (see stdio-relay.ts):
// the escape hatch for when a connection's access policy redacts a column an
// agent legitimately needs and no policy the owner could write covers every
// case up front. Redaction happens inside pine-lang's SQL generation (see
// pine.access-policy's redacted-sql-literal) -- the real value never reaches
// the app layer at all -- so "reveal" is necessarily a second, real execution
// with the policy stripped, not a cached unmask of the first one. That
// execution happens in the renderer, in the connection owner's own,
// unrestricted (see credential-store.ts's applyPolicyToOwnQueries default)
// tab, where the owner can see exactly what they're about to hand the agent
// before deciding.
//
// A request lives only in this in-memory map, never on disk: it's a
// transient conversation between one agent call and one human click, not
// state worth surviving an app restart. control-plane-server.ts creates a
// request and notifies the renderer (RevealRequestHandler.tsx, which opens a
// real tab for it); the renderer resolves it once the owner reveals or
// declines (RevealRequestBanner.tsx, via the IPC handler registered below);
// the --mcp relay's check_reveal tool long-polls it by id (waitForRevealRequest
// below), re-callable if it comes back still pending.
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { ipcMain } from 'electron';

export type RevealOutcome =
  // The owner may have edited the expression in the review tab before
  // revealing -- `expression` is whatever actually ran, which the agent
  // needs to know since it may differ from what it originally asked for.
  | { ok: true; expression: string; columns: unknown; rows: unknown }
  | { ok: false; comment?: string };

export type RevealRequest = {
  id: string;
  profileId: string;
  expression: string;
  reason?: string;
  createdAt: number;
  // 'expired': nobody answered within REVEAL_EXPIRY_MS. It no longer counts
  // toward the per-connection limit, and can't be revealed any more.
  status: 'pending' | 'revealed' | 'declined' | 'expired';
  outcome?: RevealOutcome;
  // The Claude session that asked (see investigations.ts): the request is a
  // card in that investigation's timeline in beamlynx-ui.
  investigationId?: string;
};

const requests = new Map<string, RevealRequest>();

// How long a reveal request stays on offer, the same as a policy proposal
// (PROPOSAL_EXPIRY_MS in control-plane-server.ts). Before, an unanswered
// request stayed pending forever, and three of them blocked the connection
// from asking again until the app restarted.
export const REVEAL_EXPIRY_MS = 10 * 60 * 1000;

// Wakes up waitForRevealRequest's long-poll below the moment a request
// resolves, instead of making it re-check the map on a timer. Event name is
// the request id -- a single shared emitter rather than one per request,
// since requests are created and discarded constantly and an emitter has no
// natural "done, delete me" moment of its own. Several waiters on the same
// id (e.g. an agent retrying check_reveal after a network hiccup, briefly
// overlapping the previous call's own still-pending wait) are expected and
// harmless, so the default max-listeners-per-event-name warning (10) is
// raised well past anything that could happen here.
const resolutionEvents = new EventEmitter();
resolutionEvents.setMaxListeners(50);

export function createRevealRequest(
  profileId: string,
  expression: string,
  reason?: string,
  investigationId?: string,
): RevealRequest {
  const request: RevealRequest = {
    id: randomUUID(),
    profileId,
    expression,
    reason,
    createdAt: Date.now(),
    status: 'pending',
    ...(investigationId ? { investigationId } : {}),
  };
  requests.set(request.id, request);
  return request;
}

/** How many reveal requests for this connection are still waiting on the owner. */
export function countPendingRevealRequests(profileId: string): number {
  let count = 0;
  for (const request of requests.values()) {
    if (request.profileId === profileId && request.status === 'pending') count++;
  }
  return count;
}

export function getRevealRequest(id: string): RevealRequest | undefined {
  return requests.get(id);
}

/** Every request still waiting on the owner, oldest first. Re-sent when the window reloads. */
export function listPendingRevealRequests(): RevealRequest[] {
  return [...requests.values()].filter(r => r.status === 'pending');
}

/**
 * A request nobody answered in time. True if it was still pending. Wakes a
 * waiting check_reveal, which then says it expired.
 */
export function expireRevealRequest(id: string): boolean {
  const request = requests.get(id);
  if (!request || request.status !== 'pending') return false;
  request.status = 'expired';
  resolutionEvents.emit(id, request);
  return true;
}

// Never refuses re-resolving an already-resolved request -- the owner's tab
// is the only caller, and there's nothing to protect against here (unlike
// credential-store.ts's setMcpEnabled/attachTemplate guards, which
// exist because *different* callers could otherwise fight over one
// invariant). A second call just overwrites the first outcome. An expired
// request is refused: the agent has stopped waiting for it.
export function resolveRevealRequest(id: string, outcome: RevealOutcome): RevealRequest | null {
  const request = requests.get(id);
  if (!request || request.status === 'expired') return null;
  request.status = outcome.ok ? 'revealed' : 'declined';
  request.outcome = outcome;
  resolutionEvents.emit(id, request);
  return request;
}

/**
 * Resolves once the given request stops being pending, or after `timeoutMs`,
 * whichever comes first -- what check_reveal's long-poll (GET /reveal/:id in
 * control-plane-server.ts) awaits instead of returning "pending" immediately.
 * Always resolves, never rejects: a still-pending request after the wait is
 * a completely normal outcome (the owner just hasn't decided yet), the same
 * as what a plain getRevealRequest() call would have returned before this
 * existed -- not a failure the caller needs a catch block for. An unknown id
 * resolves immediately with `undefined`, same as getRevealRequest would.
 */
export function waitForRevealRequest(id: string, timeoutMs: number): Promise<RevealRequest | undefined> {
  const current = requests.get(id);
  if (!current || current.status !== 'pending') {
    return Promise.resolve(current);
  }
  return new Promise(resolve => {
    const onResolve = (request: RevealRequest) => {
      clearTimeout(timer);
      resolve(request);
    };
    const timer = setTimeout(() => {
      resolutionEvents.off(id, onResolve);
      resolve(requests.get(id));
    }, timeoutMs);
    resolutionEvents.once(id, onResolve);
  });
}

export function registerRevealIpc(): void {
  // Same 'mcp:<action>' namespace as render-bridge.ts's mcp:query-request/
  // mcp:query-response and control-plane-server.ts's mcp:reveal-request.
  ipcMain.handle('mcp:reveal-resolve', (_event, id: string, outcome: RevealOutcome) =>
    resolveRevealRequest(id, outcome),
  );
}
