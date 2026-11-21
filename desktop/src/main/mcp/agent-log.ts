// Saves every MCP tool call an agent makes to beamlynx.db (app-db.ts's
// agent_call table), for a retro on how agents use Beamlynx: see
// scripts/agent-retro.mjs and beamlynx-plans/plans/024-agents-work-in-pine.md,
// part E.
//
// What is saved is what the agent sent and how the call went: the tool, the
// Pine or SQL, the error, how many rows came back. Never the rows. The
// database is saved as the hash of its key, never its address.
//
// Saving never fails a call or the activity feed: a locked or broken file
// only means this call isn't in the log.
import { getAppDb } from '../app-db-ipc';
import { databaseKeyOf } from '../database-key';
import { listConnections } from '../credential-store';
import type { AgentActivity } from './activity';

// The database key of each saved connection, looked up once per id. A
// connection's address doesn't change under the same id.
const keys = new Map<string, string | null>();

function databaseKeyFor(connectionId: string | undefined): string | null {
  if (!connectionId) return null;
  if (!keys.has(connectionId)) {
    const meta = listConnections().find(c => c.id === connectionId);
    keys.set(connectionId, meta ? databaseKeyOf(meta) : null);
  }
  return keys.get(connectionId) ?? null;
}

let lastFailure: string | null = null;

export function recordAgentActivity(event: AgentActivity, investigationId: string | undefined): void {
  try {
    getAppDb().recordAgentCall({
      id: event.id,
      investigationId: investigationId ?? 'unknown',
      tool: event.tool,
      phase: event.phase,
      at: event.at,
      input: event.detail,
      databaseKey: databaseKeyFor(event.connectionId),
      question: event.question,
      finding: event.finding,
      ok: event.ok,
      error: event.ok === false ? event.outcome : undefined,
      rows: event.rows,
    });
    lastFailure = null;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (reason !== lastFailure) {
      lastFailure = reason;
      console.error(`[agent-log] couldn't save an agent call: ${reason}`);
    }
  }
}
