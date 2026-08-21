import { Ast, PineRange, Table } from '../client';

// Canvas mode never parses Pine itself — the server does that (see /build's
// `ast.ranges`). This module only re-slices the original expression string
// using the offsets the server already computed, and only ever produces new
// *text*: every gesture in canvas mode is a splice on this segment list
// followed by a normal build, never a direct mutation of the graph.

export type SegmentKind =
  | 'table'
  | 'select'
  | 'where'
  | 'order'
  | 'from'
  | 'limit'
  | 'group'
  | 'count'
  | 'delete'
  | 'delete-action'
  | 'update'
  | 'assign';

/**
 * One pipe segment of a Pine expression. `owner` is the table alias whose
 * "current" context this segment belongs to (see assignOwners) - null only
 * for a segment before any table has been picked yet.
 *
 * `start`/`end` are flat character offsets into the *original* expression
 * this segment was derived from - meaningless (and unused) on a segment
 * synthesized by a splice helper rather than read from `ast.ranges`.
 */
export type Segment = {
  text: string;
  start: number;
  end: number;
  kind: SegmentKind;
  owner: string | null;
};

const ALIAS = '[A-Za-z][A-Za-z0-9_-]*';

/**
 * Convert a 0-indexed {line, character} position (the shape pine-lang's
 * `ast.ranges` uses) to a flat character offset - the inverse of pine-lang's
 * own `offset->position` (src/pine/ast/main.clj).
 */
export const offsetFromPosition = (
  expression: string,
  pos: { line: number; character: number },
): number => {
  const lines = expression.split('\n');
  let offset = 0;
  for (let i = 0; i < pos.line; i++) {
    offset += lines[i].length + 1; // +1 for the newline consumed between lines
  }
  return offset + pos.character;
};

// Classified by prefix only - matches how pine.bnf actually distinguishes
// operations. The one gap: a bare `where` condition with no `where:`/`w:`
// prefix (legal per the grammar, e.g. `company | where: a = 1 | b = 2`)
// falls through to the default 'table' kind below. That's fine for owner
// tracking (it still inherits the current alias - see assignOwners) but it
// means such a segment won't render as an editable where-chip. Canvas-
// generated Pine always writes the explicit prefix, so this only affects
// hand-typed expressions using the terse bare-condition form.
const classifyKind = (text: string): SegmentKind => {
  if (/^(select:|s:)/i.test(text)) return 'select';
  if (/^(where:|w:)/i.test(text)) return 'where';
  if (/^(order:|o:)/i.test(text)) return 'order';
  if (/^(from:|f:)/i.test(text)) return 'from';
  if (/^(limit:|l:)/i.test(text)) return 'limit';
  if (/^(group:|g:)/i.test(text)) return 'group';
  if (/^count:/i.test(text)) return 'count';
  if (/^(delete!|d!)/i.test(text)) return 'delete-action';
  if (/^(delete:|d:)/i.test(text)) return 'delete';
  if (/^(update!|u!)/i.test(text)) return 'update';
  if (/^=\s*\S/.test(text)) return 'assign';
  return 'table';
};

// A table segment's own alias, from its (possibly not-last) `as <alias>`
// modifier. Table modifiers can appear in any order/repeat per pine.bnf, so
// this takes the *last* match rather than assuming position.
const extractAsAlias = (text: string): string | null => {
  const matches = Array.from(text.matchAll(new RegExp(`\\bas\\s+(${ALIAS})`, 'gi')));
  return matches.length ? matches[matches.length - 1][1] : null;
};

const extractFromAlias = (text: string): string | null => {
  const m = text.match(new RegExp(`^(?:from:|f:)\\s*(${ALIAS})`, 'i'));
  return m ? m[1] : null;
};

/** A `|= name` segment's own assigned name - null if the text doesn't actually match that shape. */
const extractAssignName = (text: string): string | null => {
  const m = text.match(/^=\s*(\S+)/);
  return m ? m[1] : null;
};

/**
 * Walk segments left to right, assigning each one the alias of the table
 * it's "owned by": a table segment sets the current alias to its own (via
 * `as <alias>`, falling back to the corresponding entry in
 * `ast['selected-tables']` when the table has no explicit alias yet); a
 * `from: X` segment resets the current alias to X; an `= name` segment
 * (naming a checkpoint - see ensureExplicitCheckpointName) resets it to
 * `name`, the same way `from:` does, so anything after it (a container's own
 * select/where/order) is owned by the checkpoint rather than by whichever
 * table happened to be current when the checkpoint was written; every other
 * segment inherits whatever the current alias is.
 *
 * `selectedTables` is positional against *committed* table segments only -
 * the last table op is excluded from `ast['selected-tables']` while it's
 * still being typed (see pipeline.md), so a trailing uncommitted table
 * segment is left with `owner: null` rather than guessing.
 */
const assignOwners = (segments: Segment[], selectedTables: Table[]): void => {
  let currentAlias: string | null = null;
  let tableIdx = 0;
  for (const seg of segments) {
    if (seg.kind === 'table') {
      const alias =
        extractAsAlias(seg.text) ?? (tableIdx < selectedTables.length ? selectedTables[tableIdx].alias : null);
      if (alias) tableIdx++;
      currentAlias = alias;
      seg.owner = alias;
    } else if (seg.kind === 'from') {
      currentAlias = extractFromAlias(seg.text) ?? currentAlias;
      seg.owner = currentAlias;
    } else if (seg.kind === 'assign') {
      currentAlias = extractAssignName(seg.text) ?? currentAlias;
      seg.owner = currentAlias;
    } else {
      seg.owner = currentAlias;
    }
  }
};

/**
 * Segment the expression using the server's own `ast.ranges` (segment
 * *boundaries* only - `ranges[].alias` itself is unreliable once `from:` is
 * in play, see the plan doc, so attribution is redone here via
 * `assignOwners`). Returns null when the expression doesn't currently parse
 * (`ranges`/`selected-tables` come back null) - callers should keep
 * rendering the last good graph rather than treat this as empty.
 */
export const segmentsFromAst = (expression: string, ast: Ast | null | undefined): Segment[] | null => {
  if (!ast?.ranges || !ast['selected-tables']) return null;
  const segments: Segment[] = ast.ranges.map((r: PineRange) => {
    const start = offsetFromPosition(expression, r.start);
    const end = offsetFromPosition(expression, r.end);
    const text = expression.slice(start, end).trim();
    return { text, start, end, kind: classifyKind(text), owner: null };
  });
  assignOwners(segments, ast['selected-tables']);
  return segments;
};

/**
 * The table currently being typed - excluded from `ast['selected-tables']`
 * while `operation.type === 'table'` (see pipeline.md). `ast.current` always
 * holds this table's real alias (auto-generated or explicit) regardless of
 * whether the user has written `as <alias>` yet - `operation.value.alias`
 * only appears once they actually type it, so `current` is the only source
 * that's safe to use as this table's identity elsewhere (probes, pinning).
 */
export type InProgressTable = { schema: string | null; table: string; alias: string };

export const inProgressTable = (ast: Ast | null | undefined): InProgressTable | null => {
  if (!ast || ast.operation?.type !== 'table') return null;
  const value = ast.operation.value as { schema?: string | null; table?: string } | undefined;
  if (!value?.table || !ast.current) return null;
  return { schema: value.schema ?? null, table: value.table, alias: ast.current };
};

export const toText = (segments: Segment[]): string => segments.map(s => s.text).join(' | ');

const synthetic = (text: string, kind: SegmentKind, owner: string | null): Segment => ({
  text,
  start: -1,
  end: -1,
  kind,
  owner,
});

/**
 * Insert/replace/remove the single segment of `kind` owned by `ownerAlias`.
 * `text: null` removes it. Insertion point is right after the last existing
 * segment owned by `ownerAlias` (so repeated upserts on the same node stack
 * in a stable order instead of drifting toward the end of the expression).
 *
 * Scans within the pre-checkpoint body only (see splitAtCheckpoint),
 * not the raw segment list - `assignOwners` gives a trailing group:/limit:
 * the *same* owner as whatever table alias was current when it was written
 * (it inherits, same as every non-table/from segment), so on the table that
 * happens to be current, the naive "last segment owned by this alias" scan
 * found the checkpoint itself and inserted right after it. Found live: add a
 * `where:` on the same node a `group:` was just set on - the new condition
 * landed after `group:` instead of before it, same class of bug as
 * appendTableSegment's (pass 16) but here regardless of which alias the
 * gesture targets, since a checkpoint's inherited owner is real ownership as
 * far as this scan is concerned.
 */
export const upsertOwnedSegment = (
  segments: Segment[],
  ownerAlias: string,
  kind: SegmentKind,
  text: string | null,
): Segment[] => {
  // A gesture targeting the checkpoint itself (see currentCheckpointName) is
  // the one case that must land AFTER the checkpoint's group:/limit:/assign
  // run, not before it - it operates on the checkpoint's own sealed output,
  // which only exists once the checkpoint has run. Every other owner keeps
  // the usual "insert before the checkpoint" rule (see splitAtCheckpoint).
  const targetsCheckpoint = ownerAlias === currentCheckpointName(segments);
  // [...segments], not segments, for the checkpoint-targeting branch -
  // splitAtCheckpoint's own `before` is always a fresh copy (see its
  // `segments.slice(...)`), and body gets spliced in place below; reusing
  // the caller's array here would mutate it as a side effect instead of
  // returning a new one, unlike every other path through this function.
  const split = splitAtCheckpoint(segments);
  const body = targetsCheckpoint ? [...segments] : split.before;
  const checkpoints = targetsCheckpoint ? ([] as Segment[]) : split.checkpointRun;
  const idx = body.findIndex(s => s.owner === ownerAlias && s.kind === kind);
  if (idx >= 0) {
    if (text === null) {
      body.splice(idx, 1);
    } else {
      body[idx] = { ...body[idx], text };
    }
    return [...body, ...checkpoints];
  }
  if (text === null) return [...body, ...checkpoints]; // nothing to remove
  let insertAt = body.length;
  for (let i = body.length - 1; i >= 0; i--) {
    if (body[i].owner === ownerAlias) {
      insertAt = i + 1;
      break;
    }
  }
  body.splice(insertAt, 0, synthetic(text, kind, ownerAlias));
  return [...body, ...checkpoints];
};

/**
 * Splits the segment list at its checkpoint block - the last group:/limit:
 * segment, wherever it currently sits, plus its own `= name` if pinned.
 * `before` is everything a real table's own gesture must insert into (a
 * table/join/select/where/order/group on a table always lands here - see
 * upsertOwnedSegment/appendTableSegment); `checkpointRun` is the checkpoint
 * itself plus everything already written after it, including any select/
 * where/order the frame's own action bar has already added there (see
 * CanvasStore.openCheckpointPicker).
 *
 * Deliberately NOT "the trailing run" (an earlier version of this function,
 * splitTrailingCheckpoints, only looked at the literal last segment) -
 * found live: the frame's first action works, but every action after that
 * silently no-ops, because the checkpoint is no longer the last segment
 * once anything has been written after it. Scanning from the end for the
 * last group:/limit: - wherever it is - fixes this for good, since nothing
 * ever gets inserted *between* a checkpoint and its own `= name` (see
 * ensureExplicitCheckpointName), so the checkpoint's start is always a
 * reliable anchor regardless of how much has been added after it.
 */
export const splitAtCheckpoint = (segments: Segment[]): { before: Segment[]; checkpointRun: Segment[] } => {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].kind === 'group' || segments[i].kind === 'limit') {
      return { before: segments.slice(0, i), checkpointRun: segments.slice(i) };
    }
  }
  return { before: [...segments], checkpointRun: [] };
};

/**
 * Does the pipeline currently have a checkpoint with nothing composed on top
 * of it yet - purely a text-structure check, no AST lookup. This is
 * deliberate: pine-lang only reports a checkpoint in
 * `ast['pending-assignments']` once it has been given a name (confirmed
 * live - see the plan doc's container-node follow-up pass), so waiting on
 * that field would miss the exact "just grouped, nothing composed on top
 * yet" case this exists to detect. Whether tenant/company are still
 * individually selected-tables entries or have already been replaced by a
 * sealed container is a separate question this doesn't answer.
 */
export const hasTrailingCheckpoint = (segments: Segment[]): boolean => {
  const { checkpointRun } = splitAtCheckpoint(segments);
  return checkpointRun.length > 0 && checkpointRun.every(s => s.kind === 'group' || s.kind === 'limit' || s.kind === 'assign');
};

/** The checkpoint's already-pinned name, if any exists anywhere in the pipeline - read-only, never mutates. */
export const currentCheckpointName = (segments: Segment[]): string | null => {
  const { checkpointRun } = splitAtCheckpoint(segments);
  if (checkpointRun.length === 0) return null;
  const assign = checkpointRun.find(s => s.kind === 'assign');
  return assign ? extractAssignName(assign.text) : null;
};

export type CheckpointNameResult = { segments: Segment[]; changed: boolean; name: string | null };

/**
 * Pins an explicit `|= name` on the trailing checkpoint if it doesn't
 * already have one - the checkpoint-identity equivalent of
 * ensureExplicitAliases, and for the same reason: pine-lang's own
 * auto-generated names (`__pine_0__`, or the SQL-generation-only `x_2`/`x_5`
 * seen in raw query output) are index-derived, unstable across edits, and -
 * confirmed live - not even valid to reference back in Pine text at all
 * (`__pine_0__` is a hard parse error, since symbols must start with a
 * letter). Without a real name, nothing can compose on top of the
 * checkpoint's output - no select/where/order targeting it, no join onto it.
 *
 * Returns `name: null` when there's no checkpoint to name at all (mirrors
 * ensureExplicitAliases' `changed: false` no-op contract).
 */
export const ensureExplicitCheckpointName = (segments: Segment[]): CheckpointNameResult => {
  const { before, checkpointRun } = splitAtCheckpoint(segments);
  if (checkpointRun.length === 0) {
    return { segments, changed: false, name: null };
  }
  const existingAssign = checkpointRun.find(s => s.kind === 'assign');
  if (existingAssign) {
    return { segments, changed: false, name: extractAssignName(existingAssign.text) };
  }

  const used = new Set<string>();
  for (const seg of segments) {
    if (seg.kind === 'table') {
      const alias = extractAsAlias(seg.text);
      if (alias) used.add(alias);
    } else if (seg.kind === 'assign') {
      const name = extractAssignName(seg.text);
      if (name) used.add(name);
    }
  }
  let name = 'agg';
  let i = 2;
  while (used.has(name)) {
    name = `agg${i}`;
    i++;
  }

  // At the moment a checkpoint first gets named, nothing has been written
  // after it yet (openCheckpointPicker always pins a name before opening
  // any picker, so no select/where/order on it could exist without one) -
  // checkpointRun is just the group:/limit: segment(s) themselves, so
  // appending the assign at its end is always correct, not just "correct
  // for now."
  const next = [...before, ...checkpointRun, synthetic(`= ${name}`, 'assign', name)];
  return { segments: next, changed: true, name };
};

/**
 * Append a new table to the pipeline. `fromAlias` is set only when the join
 * reaches back to a node that is not already the current one - `from:` is a
 * context reset, not a join construct (see the plan doc); the common case
 * (joining from the node that's already current) omits it entirely.
 *
 * Inserted before any trailing group:/limit:, not after - a table/join op
 * can never legally follow a checkpoint, so appending at the *literal* end
 * would land the new join after an already-set group/limit instead of
 * extending the graph. (Found live: group a node, then join another table -
 * the new table's op ended up after `group:` in the committed text.)
 */
export const appendTableSegment = (
  segments: Segment[],
  hintPine: string,
  alias: string,
  fromAlias?: string,
  // Joining ONTO the checkpoint's own sealed output (the frame's "join"
  // action - see CanvasStore.openCheckpointPicker/pine-actions.ts's join)
  // is the mirror image of the normal case: the new table must land AFTER
  // the checkpoint, not before it - its output doesn't exist to join onto
  // until the checkpoint has run. Confirmed live: `group: c.id |= agg |
  // company_officer` (the new table directly after `|= agg`, nothing in
  // between) resolves a real FK join against agg's exposed columns.
  // Appending a join after something has ALREADY been added to target the
  // checkpoint (a select/where/order from the frame) is untested - this
  // still appends at the literal end in that case, consistent with every
  // other "stack after whatever's already there" rule in this module, but
  // hasn't been verified live.
  targetsCheckpoint = false,
): Segment[] => {
  const additions: Segment[] = [];
  if (fromAlias) {
    additions.push(synthetic(`from: ${fromAlias}`, 'from', fromAlias));
  }
  additions.push(synthetic(`${hintPine} as ${alias}`, 'table', alias));
  if (targetsCheckpoint) {
    return [...segments, ...additions];
  }
  const { before, checkpointRun } = splitAtCheckpoint(segments);
  return [...before, ...additions, ...checkpointRun];
};

/**
 * A node is safely removable in phase 1 only when it's the *last* table in
 * the pipeline. Removing an interior node is not a pure text splice: later
 * table segments that join implicitly off "whatever's current" (rather than
 * via an explicit `from:`) would silently retarget to a different parent.
 * Handling that correctly means re-deriving explicit `from:` resets for
 * every downstream join, which is real work deferred out of this pass - the
 * UI should simply not offer delete on a non-last node.
 */
export const isRemovableNode = (segments: Segment[], alias: string): boolean => {
  const tableSegments = segments.filter(s => s.kind === 'table');
  const last = tableSegments[tableSegments.length - 1];
  return last?.owner === alias;
};

/** Removes `alias`'s table segment, every segment it owns, and any `from:` pointing at it. */
export const removeNode = (segments: Segment[], alias: string): Segment[] =>
  segments.filter(s => {
    if (s.kind === 'from') return extractFromAlias(s.text) !== alias;
    return s.owner !== alias;
  });

// --- alias pinning -----------------------------------------------------

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Applies `replacer` to the parts of `text` outside single-quoted string literals. */
const mapOutsideQuotes = (text: string, replacer: (chunk: string) => string): string =>
  text
    .split(/('(?:[^'])*')/)
    .map((chunk, i) => (i % 2 === 1 ? chunk : replacer(chunk)))
    .join('');

const initials = (table: string): string => {
  const parts = table.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const letters = parts.map(p => p[0]?.toLowerCase()).join('');
  return letters || table[0]?.toLowerCase() || 't';
};

/** Short, pine-style alias: initials of the table name, then a numeric suffix on collision. */
export const makeAlias = (table: string, used: Set<string>): string => {
  const base = initials(table);
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}${i}`)) i++;
  return `${base}${i}`;
};

export type AliasPinResult = { expression: string; changed: boolean; aliasMap: Map<string, string> };

/**
 * Pins an explicit `as <alias>` on every table segment that doesn't already
 * have one, using short pine-style aliases (see makeAlias), and rewrites
 * every qualified reference to the old auto-generated alias (`c_0.name`,
 * `from: c_0`, ...) across the *entire* expression to match.
 *
 * This is the one function in this module that must not be simplified to
 * "just add `as`" - skipping the reference rewrite produces an expression
 * that still builds with HTTP 200 and a clean-looking AST, but every
 * reference to the old alias silently dangles (confirmed against the live
 * server: value types even degrade, e.g. a `uuid` where-value coming back
 * as a plain `number` once its column can no longer be resolved). See the
 * plan doc's "Node identity" section for the full probe.
 *
 * Returns the original expression unchanged (changed: false) if the
 * expression doesn't currently parse, or if every table already has an
 * explicit alias.
 */
export const ensureExplicitAliases = (expression: string, ast: Ast | null | undefined): AliasPinResult => {
  const segments = segmentsFromAst(expression, ast);
  const selectedTables = ast?.['selected-tables'];
  if (!segments || !selectedTables) {
    return { expression, changed: false, aliasMap: new Map() };
  }

  // The trailing table op (if any) is excluded from `selected-tables` while
  // still being typed - without adding it back here, a hand-typed expression
  // like `company | employee` (no trailing pipe, no aliases at all) leaves
  // its last table entirely unpinned: every gesture on that node then
  // references an alias no segment actually owns (see the plan doc).
  const trailing = inProgressTable(ast);
  const tables: { table: string; alias: string }[] =
    trailing && !selectedTables.some(t => t.alias === trailing.alias)
      ? [...selectedTables, { table: trailing.table, alias: trailing.alias }]
      : selectedTables;

  const used = new Set<string>(tables.map(t => t.alias));
  const aliasMap = new Map<string, string>();
  let tableIdx = 0;

  const pinned = segments.map(seg => {
    if (seg.kind !== 'table') return seg;
    const table = tables[tableIdx];
    tableIdx++;
    if (!table) return seg; // trailing uncommitted table op - nothing to pin yet
    if (extractAsAlias(seg.text)) return seg; // already explicit
    const oldAlias = table.alias;
    const newAlias = makeAlias(table.table, used);
    used.add(newAlias);
    aliasMap.set(oldAlias, newAlias);
    return { ...seg, text: `${seg.text} as ${newAlias}` };
  });

  if (aliasMap.size === 0) {
    return { expression, changed: false, aliasMap };
  }

  const renames = Array.from(aliasMap.entries());
  const rewritten = pinned.map(seg => {
    let text = seg.text;
    for (const [oldAlias, newAlias] of renames) {
      const re = new RegExp(`\\b${escapeRegExp(oldAlias)}\\b`, 'g');
      text = mapOutsideQuotes(text, chunk => chunk.replace(re, newAlias));
    }
    return { ...seg, text };
  });

  return { expression: toText(rewritten), changed: true, aliasMap };
};
