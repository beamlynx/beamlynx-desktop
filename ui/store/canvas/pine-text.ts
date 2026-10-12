import { Ast, Checkpoint, PineRange, Table } from '../client';

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
  /** The segment's operation index in `ast.ranges` - only on a segment read from it, never on a synthesized one. */
  index?: number;
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
/**
 * Whether an expression may change data: any pipeline step that starts with
 * delete!, d!, update! or u!. Errs towards yes, since a `|` inside a string
 * can look like a step; the only cost of a false yes is that auto-run waits
 * for Run. pine-lang's own check (effects/any-writes?) is the authority when
 * the expression is evaluated.
 */
export const mayChangeData = (expression: string): boolean =>
  /(^|\|)\s*(delete!|d!|update!|u!)/i.test(expression);

const classifyKind = (text: string): SegmentKind => {
  if (/^(select:|s:)/i.test(text)) return 'select';
  if (/^(where:|w:)/i.test(text)) return 'where';
  if (/^(order:|o:)/i.test(text)) return 'order';
  if (/^(from:|f:)/i.test(text)) return 'from';
  if (/^(limit:|l:)/i.test(text)) return 'limit';
  if (/^(group:|g:)/i.test(text)) return 'group';
  if (/^count:/i.test(text)) return 'count';
  if (/^(delete!|d!)/i.test(text)) return 'delete-action';
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
 * Every real table in the pipeline, in pipe order, across all its stages.
 *
 * `ast['selected-tables']` only holds the tables after the last checkpoint:
 * pine-lang resets its table list when it seals a checkpoint, and puts the
 * checkpoint's CTE there instead. The tables before it are in that
 * checkpoint's snapshot, under `ast['pending-assignments'][name]`. A CTE
 * entry (a table named after a checkpoint) is left out: it has no table
 * segment of its own in the text.
 *
 * The last table is still missing while it's being typed (see pipeline.md),
 * as in `selected-tables` itself.
 */
export const pipelineTables = (ast: Ast | null | undefined): Table[] => {
  if (!ast) return [];
  const checkpoints = ast.checkpoints ?? [];
  const names = new Set(checkpoints.map(c => c.name));
  const real = (tables: Table[] | undefined) => (tables ?? []).filter(t => !names.has(t.table));
  const sealed = checkpoints
    .filter(c => c.sealed)
    .flatMap(c => {
      const snapshot = ast['pending-assignments']?.[c.name];
      return real(snapshot?.tables ?? snapshot?.['selected-tables']);
    });
  return [...sealed, ...real(ast['selected-tables'])];
};

/**
 * The checkpoint a group:/limit: segment is, matched by its operation index,
 * or by its position among the checkpoint segments when there's no index.
 */
const checkpointForSegment = (
  segments: Segment[],
  i: number,
  checkpoints: Checkpoint[],
): Checkpoint | undefined => {
  const seg = segments[i];
  if (seg.index !== undefined) {
    const byIndex = checkpoints.find(c => c.index === seg.index);
    if (byIndex) return byIndex;
  }
  const position = segments.slice(0, i).filter(s => isCheckpointOp(s)).length;
  return checkpoints[position];
};

export const isCheckpointOp = (s: Segment): boolean => s.kind === 'group' || s.kind === 'limit';

/**
 * Walk segments left to right, assigning each one the alias of the table
 * it's "owned by":
 *
 * - A table segment owns itself: its `as <alias>`, or else the matching
 *   entry of `tables` (pipelineTables).
 * - A `from: X` segment moves ownership to X.
 * - A group:/limit: segment is a checkpoint. It belongs to the checkpoint's
 *   own name (from `ast.checkpoints`), and so does everything after it until
 *   the next table: the select/where/order a checkpoint's node adds work on
 *   its sealed result. Without checkpoint info (an older server) it is
 *   unowned and changes nothing.
 * - An `= name` segment moves ownership to `name`, the same way `from:` does.
 *   After a checkpoint, that is the name it already had.
 * - Every other segment inherits whatever the current alias is.
 *
 * Because a checkpoint's own segment is never owned by the table before it,
 * a gesture on that table inserts before the checkpoint (see
 * insertAfterLastOwned), whichever stage the table is in.
 *
 * `tables` is positional against *committed* table segments only - the last
 * table op is excluded while it's still being typed (see pipeline.md), so a
 * trailing uncommitted table segment is left with `owner: null` rather than
 * guessing.
 */
const assignOwners = (segments: Segment[], tables: Table[], checkpoints: Checkpoint[]): void => {
  let currentAlias: string | null = null;
  let tableIdx = 0;
  segments.forEach((seg, i) => {
    if (seg.kind === 'table') {
      const alias = extractAsAlias(seg.text) ?? (tableIdx < tables.length ? tables[tableIdx].alias : null);
      if (alias) tableIdx++;
      currentAlias = alias;
      seg.owner = alias;
    } else if (seg.kind === 'from') {
      currentAlias = extractFromAlias(seg.text) ?? currentAlias;
      seg.owner = currentAlias;
    } else if (isCheckpointOp(seg)) {
      const checkpoint = checkpointForSegment(segments, i, checkpoints);
      if (checkpoint) {
        currentAlias = checkpoint.name;
        seg.owner = checkpoint.name;
      } else {
        seg.owner = null;
      }
    } else if (seg.kind === 'assign') {
      currentAlias = extractAssignName(seg.text) ?? currentAlias;
      seg.owner = currentAlias;
    } else {
      seg.owner = currentAlias;
    }
  });
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
  // `ast.ranges` (line/character positions) are only valid for the *exact*
  // expression they were built from. `session.ast` can still describe the
  // *previous* expression for a moment right after a commit applies new
  // text - CanvasStore's own recompute reaction fires on `session.expression`
  // changing alone, before the async rebuild that produces a matching ast
  // has resolved (see that reaction's own comment). A shrinking edit (e.g.
  // deleteCheckpoint dropping two lines) means a stale range's line index
  // can point past the end of the new, shorter text - offsetFromPosition
  // indexing `lines[i]` would then be `undefined`, throwing and crashing
  // the whole app (confirmed live). Bail out to the same "keep the last
  // good graph" degrade path a malformed ast already takes below, rather
  // than let a stale-but-otherwise-well-formed ast crash on text it no
  // longer describes - the next recompute, once the matching ast arrives,
  // renders correctly.
  const lineCount = expression.split('\n').length;
  const isStale = ast.ranges.some(r => r.start.line >= lineCount || r.end.line >= lineCount);
  if (isStale) return null;
  const segments: Segment[] = ast.ranges
    .map((r: PineRange, index: number) => {
      const start = offsetFromPosition(expression, r.start);
      const end = offsetFromPosition(expression, r.end);
      const text = expression.slice(start, end).trim();
      return { text, start, end, kind: classifyKind(text), owner: null, index };
    })
    // A trailing `|` with nothing after it (the user left the text mid-edit,
    // or a previous commit's own insertion point happened to land before
    // it) still gets a range from the server - empty once trimmed, since
    // there's no operation there to have any text. Left in, this segment
    // rides along through every later commit (a real one always gets
    // spliced in *before* it, per upsertOwnedSegment/appendTableSegment's
    // "insert after this alias's own last segment" rule - never at the
    // literal end), so it silently reappears in the committed text as a
    // dangling `| ` after whatever operation the user actually asked for.
    // Filtering it out here is the one place that fixes every caller at
    // once, rather than every commit path defending against it separately.
    .filter(s => s.text !== '');
  assignOwners(segments, pipelineTables(ast), ast.checkpoints ?? []);
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

// A leading block comment, or a run of leading `--` lines. Mirrors
// pine-lang's own extract-doc (see its docs/comments.md) - deliberately only
// the *span*, verbatim and undecoded, since the one thing this side needs is
// to put the exact original characters back.
const LEADING_BLOCK_COMMENT = /^\s*\/\*[\s\S]*?\*\//;
const LEADING_LINE_COMMENTS = /^\s*(?:[ \t]*--[^\r\n]*(?:\r?\n|$))+/;

/**
 * The doc comment at the top of `expression`, exactly as written, or ''.
 *
 * Canvas rebuilds an expression out of `ast.ranges`' operation spans
 * (segmentsFromAst + toText), and a leading comment is in none of them - so
 * every gesture would silently delete the tab's own documentation. The
 * server's prettify keeps a doc comment (pine-lang's parser/prettify), but
 * that only helps text that still has one by the time it gets there.
 * CanvasStore.applyExpression puts it back; see its comment.
 */
export const leadingDoc = (expression: string): string => {
  const match = LEADING_BLOCK_COMMENT.exec(expression) ?? LEADING_LINE_COMMENTS.exec(expression);
  return match ? match[0].trim() : '';
};

/**
 * Replace (or, with empty `text`, remove) the doc comment at the top of
 * `expression`.
 *
 * The write half of the same loop every other canvas gesture uses: a comment
 * typed on the canvas is spliced into the expression text here, and the
 * rendered comment comes back on the rebuilt expression's own build response.
 * Canvas keeps no copy of it.
 *
 * A `*` followed by `/` inside `text` would close the comment early and turn
 * the rest of the comment into a syntax error, so it's spaced apart. Nothing
 * else needs escaping - Pine block comments have no other terminator.
 */
export const replaceDoc = (expression: string, text: string): string => {
  const body = expression.slice(leadingDoc(expression).length).replace(/^\s*\n/, '').trimStart();
  const cleaned = text.trim().replace(/\*\//g, '* /');
  if (!cleaned) return body;
  const lines = cleaned.split('\n');
  const comment =
    lines.length === 1
      ? `/* ${lines[0]} */`
      : `/*\n${lines.map(line => `   ${line}`.trimEnd()).join('\n')}\n */`;
  return body ? `${comment}\n${body}` : comment;
};

/** Re-attach `prev`'s doc comment to `next`, unless `next` already has one of its own. */
export const withDoc = (prev: string, next: string): string => {
  if (leadingDoc(next)) return next;
  const doc = leadingDoc(prev);
  return doc ? `${doc}\n${next}` : next;
};

const synthetic = (text: string, kind: SegmentKind, owner: string | null): Segment => ({
  text,
  start: -1,
  end: -1,
  kind,
  owner,
});

/**
 * Where a table's stage ends: the index of the first group:/limit: after the
 * last segment `alias` owns, or the end of the list. For a checkpoint's name,
 * that is the next checkpoint, since the tables joined after a checkpoint
 * are in its stage.
 *
 * A new join, group: or limit: for `alias` goes here, so it lands in the
 * stage `alias` belongs to - before the checkpoint that seals it, not after.
 */
export const stageEnd = (segments: Segment[], alias: string): number => {
  let last = -1;
  segments.forEach((s, i) => {
    if (s.owner === alias) last = i;
  });
  if (last < 0) return segments.length;
  for (let i = last + 1; i < segments.length; i++) {
    if (isCheckpointOp(segments[i])) return i;
  }
  return segments.length;
};

/** The group:/limit: segment of the checkpoint named `name`, or -1. */
export const checkpointOpIndex = (segments: Segment[], name: string): number =>
  segments.findIndex(s => isCheckpointOp(s) && s.owner === name);

/** Whether the text already names the checkpoint `name` with an `= name` right after its group:/limit:. */
export const isCheckpointPinned = (segments: Segment[], name: string): boolean => {
  const i = checkpointOpIndex(segments, name);
  return i >= 0 && segments[i + 1]?.kind === 'assign' && extractAssignName(segments[i + 1].text) === name;
};

// Splices `segment` into `body` right after the last existing segment owned
// by `ownerAlias` (so repeated inserts on the same node stack in a stable
// order instead of drifting toward the end of the expression), or at the end
// if `ownerAlias` owns nothing yet. Mutates `body` in place.
//
// No checkpoint needs splitting off first: a checkpoint's group:/limit: is
// owned by the checkpoint's own name, never by the table before it (see
// assignOwners), so "after the last segment this table owns" is always
// inside the table's own stage.
const insertAfterLastOwned = (body: Segment[], ownerAlias: string, segment: Segment): Segment[] => {
  let insertAt = body.length;
  for (let i = body.length - 1; i >= 0; i--) {
    if (body[i].owner === ownerAlias) {
      insertAt = i + 1;
      break;
    }
  }
  body.splice(insertAt, 0, segment);
  return body;
};

/**
 * Insert/replace/remove the single segment of `kind` owned by `ownerAlias`.
 * `text: null` removes it. Insertion point is right after the last existing
 * segment owned by `ownerAlias` (see insertAfterLastOwned). `ownerAlias` can
 * be a table's alias or a checkpoint's name.
 */
export const upsertOwnedSegment = (
  segments: Segment[],
  ownerAlias: string,
  kind: SegmentKind,
  text: string | null,
): Segment[] => {
  const body = [...segments];
  const idx = body.findIndex(s => s.owner === ownerAlias && s.kind === kind);
  if (idx >= 0) {
    if (text === null) {
      body.splice(idx, 1);
    } else {
      body[idx] = { ...body[idx], text };
    }
    return body;
  }
  if (text === null) return body; // nothing to remove
  return insertAfterLastOwned(body, ownerAlias, synthetic(text, kind, ownerAlias));
};

/**
 * Inserts a NEW segment of `kind` owned by `ownerAlias`, without touching any
 * existing segment of that same kind - the multi-segment counterpart to
 * upsertOwnedSegment's single-segment upsert. Used for `where:`: each
 * condition is its own `where:` step (pine-lang ANDs every `where:` step
 * together, same as it always has for two different tables - see
 * pine-lang's `pine.eval/build-bare-select`), rather than one segment whose
 * text grows a comma-separated list - so removing one condition is a plain
 * segment removal, not a string-splice into another condition's neighbor.
 */
export const appendOwnedSegment = (segments: Segment[], ownerAlias: string, kind: SegmentKind, text: string): Segment[] =>
  insertAfterLastOwned([...segments], ownerAlias, synthetic(text, kind, ownerAlias));

/**
 * The limit: segment of `alias`'s stage, or -1: the checkpoint that ends the
 * stage, when it is a limit. Without `alias`, the first limit: anywhere - the
 * multi-select toolbar's pipeline-wide limit.
 */
export const stageLimitIndex = (segments: Segment[], alias?: string): number => {
  if (alias === undefined) return segments.findIndex(s => s.kind === 'limit');
  const end = stageEnd(segments, alias);
  return segments[end]?.kind === 'limit' ? end : -1;
};

/** The N of a `limit: N` or `limit: N per ...` segment's text, or null. */
export const limitValue = (text: string): number | null => {
  const n = parseInt(text.replace(/^(limit:|l:)\s*/i, ''), 10);
  return Number.isFinite(n) ? n : null;
};

/** The limit of `alias`'s stage (see stageLimitIndex) - read-only, never mutates. */
export const currentLimit = (segments: Segment[], alias?: string): number | null => {
  const i = stageLimitIndex(segments, alias);
  return i < 0 ? null : limitValue(segments[i].text);
};

/** The name pine-lang gives a checkpoint written without `|= name`: result_1, result_2, ... */
export const AUTO_CHECKPOINT_NAME = /^result_\d+$/;

export type CheckpointNameResult = { segments: Segment[]; changed: boolean };

/**
 * Pins an explicit `|= name` on every checkpoint that doesn't already have
 * one - the checkpoint-identity equivalent of ensureExplicitAliases. The
 * name is the one pine-lang reports for it in `ast.checkpoints` (`result_1`,
 * ...). The canvas never makes a name up: pinning only writes down the name
 * the checkpoint already has.
 *
 * Why pin it at all: an auto name depends on the rest of the expression
 * (pine-lang picks the smallest free `result_N`), so it can change when
 * something else does. A select/where/join written against `result_1`
 * needs the name to stay put. The canvas's node for the checkpoint is also
 * found by this name, so it stays the same node.
 *
 * A checkpoint segment with no matching entry in `ast.checkpoints` (owner
 * null - see assignOwners) is left alone.
 */
export const ensureExplicitCheckpointName = (segments: Segment[]): CheckpointNameResult => {
  const next: Segment[] = [];
  let changed = false;
  segments.forEach((seg, i) => {
    next.push(seg);
    if (!isCheckpointOp(seg) || !seg.owner) return;
    const following = segments[i + 1];
    if (following?.kind === 'assign') return;
    next.push(synthetic(`= ${seg.owner}`, 'assign', seg.owner));
    changed = true;
  });
  return { segments: changed ? next : segments, changed };
};

/**
 * Append a new table to the pipeline. `fromAlias` is set only when the join
 * reaches back to a node that is not already the current one - `from:` is a
 * context reset, not a join construct (see the plan doc); the common case
 * (joining from the node that's already current) omits it entirely.
 *
 * Inserted at the end of the stage of the table it joins from (`sourceAlias`,
 * see stageEnd), not at the literal end: a join after a checkpoint would
 * join onto the checkpoint's sealed result instead of the table. Joining
 * from a checkpoint's own node is the same rule: its stage starts after its
 * group:/limit:/`= name`, so the new table lands there, joined onto the
 * sealed result.
 */
export const appendTableSegment = (
  segments: Segment[],
  hintPine: string,
  alias: string,
  fromAlias: string | undefined,
  sourceAlias: string,
): Segment[] => {
  const additions: Segment[] = [];
  if (fromAlias) {
    additions.push(synthetic(`from: ${fromAlias}`, 'from', fromAlias));
  }
  additions.push(synthetic(`${hintPine} as ${alias}`, 'table', alias));
  const at = stageEnd(segments, sourceAlias);
  return [...segments.slice(0, at), ...additions, ...segments.slice(at)];
};

/**
 * Any top-level table is removable - not just the last one. A checkpoint's
 * own inner tables are the one exception (layout.ts sets `removable: false`
 * there, not this check): removing one of those could break the
 * checkpoint's own join graph and shared `group:` segment in ways this
 * function doesn't account for, a separate, harder problem left for later.
 */
export const isRemovableNode = (segments: Segment[], alias: string): boolean =>
  segments.some(s => s.kind === 'table' && s.owner === alias);

/**
 * Removes `alias`'s table segment, every segment it owns, and any `from:`
 * pointing at it. Removing an interior node can leave a downstream table
 * segment implicitly re-targeted onto a different table than it originally
 * joined from (it inherits whatever's now "current" - see assignOwners) -
 * deliberately not specially handled here. Whatever the server's own join
 * resolution makes of that (a real relation, a heuristic one, or none at
 * all) is exactly what the canvas already renders correctly today: an
 * unresolved or uncertain join gets its established dashed/warning styling
 * (Canvas.tsx), same as it would for any other join the server can't
 * cleanly resolve. An earlier version of this function tried to force a
 * visible break by inserting a synthetic `from:` naming the removed alias -
 * confirmed live that pine-lang's `/build` throws an unhandled exception on
 * a `from:` naming an alias that doesn't exist, which is worse than the
 * problem it was trying to solve. Left as a plain splice instead, trusting
 * the server's own (already correct) resolution rather than second-guessing
 * it client-side.
 */
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
  if (!segments || !ast?.['selected-tables']) {
    return { expression, changed: false, aliasMap: new Map() };
  }
  // Every stage's tables, not just the last one's - see pipelineTables.
  const selectedTables = pipelineTables(ast);

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
    // A named result from an earlier block is its own alias (`top`, not
    // `t_0`): stable already, and renaming it would rewrite the name itself.
    if (table.alias === table.table) return seg;
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
