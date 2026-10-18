// An investigation is everything one Claude session does through beamlynx.
// Each `beamlynx --mcp` relay process (stdio-relay.ts) makes up an id when it
// starts and sends it on every control-plane request, in INVESTIGATION_HEADER.
// beamlynx-ui gives each investigation its own tab, with a timeline of what
// the agent did and saw.
//
// Two things wait here, in this process's memory, for the agent's next call:
// - notes the user typed in the investigation's tab (takeNotes), which the
//   relay puts at the top of that call's result;
// - approvals: a query refused for a hidden column waits, inside the agent's
//   call, for the user to allow the column or decline (waitForApproval).
// Neither survives a restart. Both belong to one conversation with one agent.
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { ipcMain } from 'electron';

export const INVESTIGATION_HEADER = 'x-beamlynx-investigation';

/**
 * The investigation id a request carries, or undefined. Checked, since it is
 * used as a key and shown to the renderer: a relay makes a UUID.
 */
export function readInvestigationId(headers: Record<string, string | string[] | undefined>): string | undefined {
  const raw = headers[INVESTIGATION_HEADER];
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(id) ? id : undefined;
}

// --- Notes --------------------------------------------------------------

export type InvestigationNote = { id: string; text: string; at: number };

const MAX_NOTE = 4000;
const notes = new Map<string, InvestigationNote[]>();

export function addNote(investigationId: string, text: string): InvestigationNote | null {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) return null;
  const note = { id: randomUUID(), text: trimmed.slice(0, MAX_NOTE), at: Date.now() };
  notes.set(investigationId, [...(notes.get(investigationId) ?? []), note]);
  return note;
}

/** The notes waiting for this investigation's agent, which are then gone. */
export function takeNotes(investigationId: string): InvestigationNote[] {
  const waiting = notes.get(investigationId) ?? [];
  notes.delete(investigationId);
  return waiting;
}

// --- Approvals ----------------------------------------------------------

export type ApprovalOutcome = { allowed: true } | { allowed: false; comment?: string };

// An approval exists from the moment either side mentions it: the renderer
// may resolve it before the relay starts waiting, or the other way round.
const outcomes = new Map<string, ApprovalOutcome>();
const resolved = new EventEmitter();
resolved.setMaxListeners(50);

export function resolveApproval(id: string, outcome: ApprovalOutcome): void {
  outcomes.set(id, outcome);
  resolved.emit(id, outcome);
}

/**
 * Resolves with the user's answer once there is one, or with undefined after
 * timeoutMs. The relay calls this again until it gets an answer, since one
 * control-plane request may not stay open longer than its own timeout.
 */
export function waitForApproval(id: string, timeoutMs: number): Promise<ApprovalOutcome | undefined> {
  const known = outcomes.get(id);
  if (known) {
    outcomes.delete(id);
    return Promise.resolve(known);
  }
  return new Promise(resolve => {
    const onResolve = (outcome: ApprovalOutcome) => {
      clearTimeout(timer);
      outcomes.delete(id);
      resolve(outcome);
    };
    const timer = setTimeout(() => {
      resolved.off(id, onResolve);
      resolve(undefined);
    }, timeoutMs);
    resolved.once(id, onResolve);
  });
}

export function registerInvestigationIpc(): void {
  ipcMain.handle('mcp:investigation-note', (_event, investigationId: string, text: string) =>
    typeof investigationId === 'string' ? addNote(investigationId, text) : null,
  );
  ipcMain.handle('mcp:approval-resolve', (_event, id: string, outcome: ApprovalOutcome) => {
    if (typeof id !== 'string' || !outcome || typeof outcome.allowed !== 'boolean') return false;
    resolveApproval(id, outcome.allowed ? { allowed: true } : { allowed: false, comment: outcome.comment });
    return true;
  });
}
