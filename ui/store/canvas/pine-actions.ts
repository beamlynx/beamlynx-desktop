import { Ast, TableHint } from '../client';
import {
  appendTableSegment,
  ensureExplicitAliases,
  isRemovableNode,
  removeNode,
  Segment,
  segmentsFromAst,
  toText,
  upsertOwnedSegment,
} from './pine-text';
import { probeBuild } from './probe';

/**
 * `aliasMap` carries every rename pinning performed (old auto/placeholder
 * alias -> new short alias), keyed by the OLD alias. A caller holding an
 * alias captured before this base was computed (e.g. the alias a click
 * handler read off the currently-rendered node) must resolve it through
 * this map before using it - the node it refers to may have just been
 * renamed by ensureExplicitAliases as part of computing this very base. See
 * resolveAlias below and canvas.store.ts's commit* methods.
 */
export type PinnedBase = { expression: string; ast: Ast; segments: Segment[]; aliasMap: Map<string, string> };

/**
 * Every gesture starts from a pinned base: if the current expression has any
 * table lacking an explicit alias, pin it first (see pine-text.ts's
 * ensureExplicitAliases) and re-build so the working ast matches the pinned
 * text before computing the actual gesture. A no-op (one extra segmentation
 * pass, no network call) once everything is already pinned - which, after
 * the very first canvas gesture on a session, is always.
 */
export const getPinnedBase = async (
  expression: string,
  ast: Ast,
  connectionId: string | undefined,
): Promise<PinnedBase | null> => {
  const { expression: pinned, changed, aliasMap } = ensureExplicitAliases(expression, ast);
  if (!changed) {
    const segments = segmentsFromAst(expression, ast);
    return segments ? { expression, ast, segments, aliasMap } : null;
  }
  const pinnedAst = await probeBuild(pinned, connectionId);
  const segments = segmentsFromAst(pinned, pinnedAst);
  return segments ? { expression: pinned, ast: pinnedAst, segments, aliasMap } : null;
};

/** Resolves an alias captured before `base` was computed through its rename map (see PinnedBase). */
export const resolveAlias = (base: PinnedBase, alias: string): string => base.aliasMap.get(alias) ?? alias;

export const pickFirstTable = (hint: TableHint, alias: string): string => `${hint.pine} as ${alias}`;

export const join = (base: PinnedBase, hint: TableHint, alias: string, fromAlias?: string): string =>
  toText(appendTableSegment(base.segments, hint.pine, alias, fromAlias));

// Select/order chips are always written by canvas as plain `alias.column` -
// so toggling the desired set and regenerating the whole segment is safe.
// (This loses a hand-typed column-function form like `created_at => month`
// on the next toggle - the same simplification the pre-existing candidate-
// column click already makes; see SelectedNodeComponent's onCandidateColumnClick.)
export const setSelectColumns = (base: PinnedBase, alias: string, columns: string[]): string =>
  toText(
    upsertOwnedSegment(
      base.segments,
      alias,
      'select',
      columns.length ? `select: ${columns.map(c => `${alias}.${c}`).join(', ')}` : null,
    ),
  );

/**
 * Reads the columns currently selected for `alias` off `base.segments` -
 * used to compute the toggled set from *this* base rather than from
 * whatever the (possibly one-gesture-stale) rendered canvasGraph shows, so
 * two rapid toggles on the same still-open picker each see the other's
 * result instead of one silently overwriting the other. Assumes plain
 * `alias.column` entries, same as setSelectColumns above.
 */
export const getSelectColumns = (base: PinnedBase, alias: string): string[] => {
  const existing = base.segments.find(s => s.owner === alias && s.kind === 'select');
  if (!existing) return [];
  const body = existing.text.replace(/^(select:|s:)\s*/i, '');
  return splitTopLevel(body).map(part => {
    const dot = part.lastIndexOf('.');
    return dot >= 0 ? part.slice(dot + 1) : part;
  });
};

const buildWhereLiteral = (value: string): string => {
  const isBareLiteral =
    /^-?\d+(\.\d+)?$/.test(value) || ['true', 'false', 'null'].includes(value.toLowerCase());
  return isBareLiteral ? value : `'${value.replace(/'/g, "''")}'`;
};

// Splits a comma-separated segment body on top-level commas only - i.e. not
// commas inside a quoted where-value - so an existing hand-typed condition
// list can be edited by index rather than regenerated from the (lossy,
// value-coercing) ast.where.
export const splitTopLevel = (text: string): string[] => {
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  for (const ch of text) {
    if (ch === "'") inQuote = !inQuote;
    if (ch === ',' && !inQuote) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

export const addWhereCondition = (
  base: PinnedBase,
  alias: string,
  column: string,
  operator: string,
  value: string,
): string => {
  const existing = base.segments.find(s => s.owner === alias && s.kind === 'where');
  const priorConditions = existing ? splitTopLevel(existing.text.replace(/^(where:|w:)\s*/i, '')) : [];
  const newCondition = `${alias}.${column} ${operator} ${buildWhereLiteral(value)}`;
  const text = [...priorConditions, newCondition].join(', ');
  return toText(upsertOwnedSegment(base.segments, alias, 'where', `where: ${text}`));
};

export const removeWhereConditionAt = (base: PinnedBase, alias: string, index: number): string => {
  const existing = base.segments.find(s => s.owner === alias && s.kind === 'where');
  if (!existing) return toText(base.segments);
  const conditions = splitTopLevel(existing.text.replace(/^(where:|w:)\s*/i, ''));
  conditions.splice(index, 1);
  return toText(
    upsertOwnedSegment(base.segments, alias, 'where', conditions.length ? `where: ${conditions.join(', ')}` : null),
  );
};

export const addOrderColumn = (
  base: PinnedBase,
  alias: string,
  column: string,
  direction: 'asc' | 'desc',
): string => {
  const existing = base.segments.find(s => s.owner === alias && s.kind === 'order');
  const priorColumns = existing ? splitTopLevel(existing.text.replace(/^(order:|o:)\s*/i, '')) : [];
  const newColumn = `${alias}.${column} ${direction}`;
  const text = [...priorColumns, newColumn].join(', ');
  return toText(upsertOwnedSegment(base.segments, alias, 'order', `order: ${text}`));
};

/** Reads the columns `alias` is currently ordered by (direction stripped) - see getSelectColumns for why this reads from `base.segments`, not the rendered canvasGraph. */
export const getOrderColumns = (base: PinnedBase, alias: string): string[] => {
  const existing = base.segments.find(s => s.owner === alias && s.kind === 'order');
  if (!existing) return [];
  const body = existing.text.replace(/^(order:|o:)\s*/i, '');
  return splitTopLevel(body).map(part => {
    const withoutDirection = part.replace(/\s+(asc|desc)$/i, '');
    const dot = withoutDirection.lastIndexOf('.');
    return dot >= 0 ? withoutDirection.slice(dot + 1) : withoutDirection;
  });
};

export const removeOrderColumnAt = (base: PinnedBase, alias: string, index: number): string => {
  const existing = base.segments.find(s => s.owner === alias && s.kind === 'order');
  if (!existing) return toText(base.segments);
  const columns = splitTopLevel(existing.text.replace(/^(order:|o:)\s*/i, ''));
  columns.splice(index, 1);
  return toText(
    upsertOwnedSegment(base.segments, alias, 'order', columns.length ? `order: ${columns.join(', ')}` : null),
  );
};

/** Returns null when `alias` isn't the last table in the pipeline - see isRemovableNode. */
export const deleteNode = (base: PinnedBase, alias: string): string | null =>
  isRemovableNode(base.segments, alias) ? toText(removeNode(base.segments, alias)) : null;

/** `limit:` is unowned (applies to the whole pipeline, not one table) - at most one such segment, always at the end. */
export const setLimit = (base: PinnedBase, value: number | null): string => {
  const withoutLimit = base.segments.filter(s => s.kind !== 'limit');
  if (value === null) return toText(withoutLimit);
  return toText([...withoutLimit, { text: `limit: ${value}`, start: -1, end: -1, kind: 'limit', owner: null }]);
};

/**
 * `group:` is unowned like `limit:` (applies once across the whole pipeline,
 * not per table) but unlike every other clause here, more than one table can
 * contribute to it - "company -> tenant, grouped by both tenant_id and
 * company_id" is one shared `group: t.tenant_id, c.company_id` segment, not
 * two. getGroupColumns/setGroupColumns read and rewrite only `alias`'s own
 * qualified entries within that one list, leaving every other alias's
 * columns untouched - so there's no need to track "where" a given alias's
 * contribution lives; it's re-derived from the segment's own text every time.
 */
export const getGroupColumns = (base: PinnedBase, alias: string): string[] => {
  const existing = base.segments.find(s => s.kind === 'group');
  if (!existing) return [];
  const body = existing.text.replace(/^(group:|g:)\s*/i, '');
  return splitTopLevel(body)
    .filter(part => part.startsWith(`${alias}.`))
    .map(part => part.slice(alias.length + 1));
};

// Always appended at the very end, same as setLimit - for now, group: only
// ever needs to be the pipeline's true last operation, since canvas mode has
// nothing that runs after it yet (no sealing a checkpoint into its own
// variable/CTE mid-pipeline - that's future work). Once it does, this will
// need to target "the end of the current segment, before whatever comes
// next" instead of the literal end of the whole expression.
export const setGroupColumns = (base: PinnedBase, alias: string, columns: string[]): string => {
  const existing = base.segments.find(s => s.kind === 'group');
  const priorAll = existing ? splitTopLevel(existing.text.replace(/^(group:|g:)\s*/i, '')) : [];
  const others = priorAll.filter(part => !part.startsWith(`${alias}.`));
  const mine = columns.map(c => `${alias}.${c}`);
  const nextAll = [...others, ...mine];
  const withoutGroup = base.segments.filter(s => s.kind !== 'group');
  if (nextAll.length === 0) return toText(withoutGroup);
  return toText([...withoutGroup, { text: `group: ${nextAll.join(', ')}`, start: -1, end: -1, kind: 'group', owner: null }]);
};
