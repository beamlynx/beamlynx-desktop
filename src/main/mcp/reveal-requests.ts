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
// the --mcp relay's check_reveal tool polls it by id until it stops being
// pending.
import { randomUUID } from 'crypto';
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
  status: 'pending' | 'revealed' | 'declined';
  outcome?: RevealOutcome;
};

const requests = new Map<string, RevealRequest>();

export function createRevealRequest(profileId: string, expression: string, reason?: string): RevealRequest {
  const request: RevealRequest = {
    id: randomUUID(),
    profileId,
    expression,
    reason,
    createdAt: Date.now(),
    status: 'pending',
  };
  requests.set(request.id, request);
  return request;
}

export function getRevealRequest(id: string): RevealRequest | undefined {
  return requests.get(id);
}

// Never refuses re-resolving an already-resolved request -- the owner's tab
// is the only caller, and there's nothing to protect against here (unlike
// credential-store.ts's setMcpEnabled/setConnectionPolicy guards, which
// exist because *different* callers could otherwise fight over one
// invariant). A second call just overwrites the first outcome.
export function resolveRevealRequest(id: string, outcome: RevealOutcome): RevealRequest | null {
  const request = requests.get(id);
  if (!request) return null;
  request.status = outcome.ok ? 'revealed' : 'declined';
  request.outcome = outcome;
  return request;
}

export function registerRevealIpc(): void {
  // Same 'mcp:<action>' namespace as render-bridge.ts's mcp:query-request/
  // mcp:query-response and control-plane-server.ts's mcp:reveal-request.
  ipcMain.handle('mcp:reveal-resolve', (_event, id: string, outcome: RevealOutcome) =>
    resolveRevealRequest(id, outcome),
  );
}
