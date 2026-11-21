// An investigation is everything one Claude session does through beamlynx.
// Each `beamlynx --mcp` relay process (stdio-relay.ts) makes up an id when it
// starts and sends it on every control-plane request, in INVESTIGATION_HEADER.
// beamlynx-ui gives each investigation its own tab, with a timeline of what
// the agent did and saw.
//
// Notes the user typed in the investigation's tab wait here, in this
// process's memory, for the agent's next call (takeNotes), which the relay
// puts at the top of that call's result. They don't survive a restart. They
// belong to one conversation with one agent. An agent's proposed policy
// change waits for the user's answer in policy-proposals.ts.
import { randomUUID } from 'crypto';
import { ipcMain } from 'electron';
import { resolveProposal } from './policy-proposals';

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

export function registerInvestigationIpc(): void {
  ipcMain.handle('mcp:investigation-note', (_event, investigationId: string, text: string) =>
    typeof investigationId === 'string' ? addNote(investigationId, text) : null,
  );
  // The user's answer to an agent's proposed policy change, after the
  // renderer applied it, or not. False for a proposal nobody waits on.
  ipcMain.handle('mcp:policy-proposal-resolve', (_event, id: string, outcome: { applied?: unknown; comment?: unknown }) => {
    if (typeof id !== 'string' || !outcome || typeof outcome.applied !== 'boolean') return false;
    const comment = typeof outcome.comment === 'string' ? outcome.comment.slice(0, 2000) : undefined;
    return resolveProposal(id, outcome.applied ? { applied: true } : { applied: false, comment });
  });
}
