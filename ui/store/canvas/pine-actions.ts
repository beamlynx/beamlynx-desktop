import { Ast, TableHint } from '../client';
import { JoinType, WhereConditionDraft } from './canvas.model';
import { DateBounds } from './relative-date';
import {
  appendOwnedSegment,
  appendTableSegment,
  AUTO_CHECKPOINT_NAME,
  ensureExplicitAliases,
  ensureExplicitCheckpointName,
  isCheckpointOp,
  isRemovableNode,
  mapOutsideQuotes,
  removeNode,
  Segment,
  segmentsFromAst,
  stageEnd,
  stageLimitIndex,
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
 *
 * Checkpoints need no rename map: pinning writes down the name pine-lang
 * already reports for each one (see ensureExplicitCheckpointName), so a
 * checkpoint's name is the same before and after.
 */
export type PinnedBase = {
  expression: string;
  ast: Ast;
  segments: Segment[];
  aliasMap: Map<string, string>;
};

/**
 * Every gesture starts from a pinned base: if the current expression has any
 * table lacking an explicit alias, pin it first (see pine-text.ts's
 * ensureExplicitAliases), then do the same for every checkpoint lacking an
 * explicit `|= name` (ensureExplicitCheckpointName) - each pinning step
 * that actually changes the text is followed by a re-build, so the working
 * ast always matches the pinned text before computing the actual gesture. A
 * no-op (extra segmentation passes only, no network calls) once everything
 * is already pinned - which, after the first gesture that touches a given
 * table or checkpoint, is always.
 */
export const getPinnedBase = async (
  expression: string,
  ast: Ast | null | undefined,
  connectionId: string | undefined,
  // The tab's other blocks this one builds with - see probe.ts.
  context: string[] = [],
): Promise<PinnedBase | null> => {
  const aliasPin = ensureExplicitAliases(expression, ast);
  let curExpression = expression;
  let curAst = ast;
  if (aliasPin.changed) {
    curExpression = aliasPin.expression;
    curAst = await probeBuild(curExpression, connectionId, context);
  }

  let segments = segmentsFromAst(curExpression, curAst);
  if (!segments) return null;

  const namePin = ensureExplicitCheckpointName(segments);
  if (namePin.changed) {
    curExpression = toText(namePin.segments);
    curAst = await probeBuild(curExpression, connectionId, context);
    segments = segmentsFromAst(curExpression, curAst);
    if (!segments) return null;
  }

  return {
    expression: curExpression,
    // Not undefined here: segmentsFromAst (both calls above) already
    // returned null - bailing out before this point - whenever curAst
    // itself was null/undefined/unparseable, so reaching this line proves
    // curAst was a real Ast. TS can't correlate that with `segments`
    // being a different, already-narrowed variable, hence the assertion.
    ast: curAst!,
    segments,
    aliasMap: aliasPin.aliasMap,
  };
};

/**
 * Resolves an alias captured before `base` was computed through its rename
 * map (see PinnedBase). A node drawn from an earlier query block has its
 * block's prefix in front of its alias (`b0/c` - see layout.ts's
 * NamedBlock); the text only knows `c`, so the prefix goes.
 */
export const resolveAlias = (base: PinnedBase, alias: string): string => {
  const plain = alias.replace(BLOCK_PREFIX, '');
  return base.aliasMap.get(plain) ?? plain;
};

/** The prefix of a node id drawn from an earlier query block: `b0/`. */
export const BLOCK_PREFIX = /^b\d+\//;

/** resolveAlias for every condition of a where draft - each carries its own alias. */
export const resolveConditionAliases = (base: PinnedBase, conditions: WhereConditionDraft[]): WhereConditionDraft[] =>
  conditions.map(c => ({ ...c, alias: resolveAlias(base, c.alias) }));

export const pickFirstTable = (hint: TableHint, alias: string): string => `${hint.pine} as ${alias}`;

export const join = (base: PinnedBase, hint: TableHint, alias: string, fromAlias?: string): string => {
  // The new table goes into the stage of the node it joins from: an explicit
  // fromAlias, or - when omitted, meaning "join off whatever's already
  // current" - base.ast.current. A checkpoint's name works the same way, and
  // joins onto its sealed result. See appendTableSegment.
  const source = fromAlias ?? base.ast.current;
  return toText(appendTableSegment(base.segments, hint.pine, alias, fromAlias, source));
};

// Matches a table segment's own `:left`/`:right` modifier (pine.bnf's
// table-mod) so setJoinType can strip a prior one before applying the next -
// table modifiers can appear in any order/repeat per the grammar (see
// pine-text.ts's extractAsAlias), but canvas only ever writes at most one of
// these on a segment it generated.
const JOIN_MODIFIER_RE = /\s+:(?:left|right)\b/gi;

/**
 * Sets (or clears, for 'inner') the `:left`/`:right` modifier on `alias`'s
 * own table segment - the segment `appendTableSegment` created for it when
 * it was first joined in. This is the one thing that actually changes the
 * emitted SQL join keyword (pine-lang's eval.clj); which "has"/"belongs to"
 * FK direction resolved the join (ast.joins's `relation[2]`) is a completely
 * separate axis this doesn't touch.
 */
export const setJoinType = (base: PinnedBase, alias: string, type: JoinType): string => {
  const idx = base.segments.findIndex(s => s.kind === 'table' && s.owner === alias);
  if (idx < 0) return toText(base.segments);
  const stripped = base.segments[idx].text.replace(JOIN_MODIFIER_RE, '');
  const text = type === 'inner' ? stripped : `${stripped} :${type}`;
  const next = [...base.segments];
  next[idx] = { ...next[idx], text };
  return toText(next);
};

// Select/order chips are always written by canvas as plain `alias.column` -
// so toggling the desired set and regenerating the whole segment is safe.
// (This loses a hand-typed column-function form like `created_at => month`
// on the next toggle - the same simplification the pre-existing candidate-
// column click already makes; see SelectedNodeComponent's onCandidateColumnClick.)
export const setSelectColumns = (base: PinnedBase, alias: string, columns: string[]): string => {
  // What the step reads from the elements of an `unnest:` on this table,
  // `e.field`, isn't one of the table's columns: it stays as typed.
  const elementParts = selectParts(base, alias).filter(part => isElementPart(base, part));
  const parts = [...columns.map(c => `${alias}.${c}`), ...elementParts];
  return toText(upsertOwnedSegment(base.segments, alias, 'select', parts.length ? `select: ${parts.join(', ')}` : null));
};

const selectParts = (base: PinnedBase, alias: string): string[] => {
  const existing = base.segments.find(s => s.owner === alias && s.kind === 'select');
  return existing ? splitTopLevel(existing.text.replace(/^(select:|s:)\s*/i, '')) : [];
};

/**
 * Whether a part of a step, `e.field` or `e.field desc`, reads the elements
 * of an `unnest:` rather than a column of the table. Such a part is in a
 * step the table owns, since the pipe stays on the table, but its chip is
 * listed apart (see layout.ts's elementChips).
 */
const isElementPart = (base: PinnedBase, part: string): boolean => {
  const name = part.trim().match(/^([A-Za-z_][A-Za-z0-9_-]*)/)?.[1];
  return !!name && (base.ast.unnests ?? []).some(u => u.alias === name);
};

/** A `where:` step the table owns, but whose first condition is on elements. */
const isElementWhere = (base: PinnedBase, segment: Segment): boolean =>
  isElementPart(base, segment.text.replace(/^(where:|w:)\s*/i, ''));

/** `alias`'s own `where:` steps, in the order its where chips are listed. */
const ownWhereSegments = (base: PinnedBase, alias: string): Segment[] =>
  base.segments.filter(s => s.owner === alias && s.kind === 'where' && !isElementWhere(base, s));

/** Removes the `index`th `where:` step on elements of `alias`'s table, in the order its chips are listed. */
export const removeElementWhereAt = (base: PinnedBase, alias: string, index: number): string => {
  const target = base.segments.filter(s => s.owner === alias && s.kind === 'where' && isElementWhere(base, s))[
    index
  ];
  return toText(target ? base.segments.filter(s => s !== target) : base.segments);
};

const STEP_PREFIX = { select: /^(select:|s:)\s*/i, order: /^(order:|o:)\s*/i };

/**
 * The select: or order: step that holds items on the elements of `alias`'s
 * `unnest:`: the table's last such step after its last `unnest:`. A step
 * before the `unnest:` can't read the elements, and Pine refuses it. -1
 * when there is none.
 */
const elementStepIndex = (segments: Segment[], alias: string, kind: 'select' | 'order'): number => {
  let unnest = -1;
  segments.forEach((s, i) => {
    if (s.owner === alias && s.kind === 'unnest') unnest = i;
  });
  if (unnest < 0) return -1;
  for (let i = segments.length - 1; i > unnest; i--) {
    if (segments[i].owner === alias && segments[i].kind === kind) return i;
  }
  return -1;
};

/** The items of the step elementStepIndex finds, or none. */
const elementStepParts = (base: PinnedBase, alias: string, kind: 'select' | 'order'): string[] => {
  const index = elementStepIndex(base.segments, alias, kind);
  return index < 0 ? [] : splitTopLevel(base.segments[index].text.replace(STEP_PREFIX[kind], ''));
};

/**
 * Writes `parts` as the step elementStepIndex finds. Without one, a new
 * step is added after the table's own steps, so after its `unnest:`. No
 * parts removes the step.
 */
const withElementStep = (base: PinnedBase, alias: string, kind: 'select' | 'order', parts: string[]): string => {
  const index = elementStepIndex(base.segments, alias, kind);
  const text = parts.length ? `${kind}: ${parts.join(', ')}` : null;
  if (index < 0) return toText(text ? appendOwnedSegment(base.segments, alias, kind, text) : base.segments);
  const next = [...base.segments];
  if (text) next[index] = { ...next[index], text };
  else next.splice(index, 1);
  return toText(next);
};

/**
 * Removes one element item, `e.field`, from `alias`'s own select:, order:
 * or group: step - the × on an element chip. An order chip carries its
 * direction, so items are matched by their column.
 */
export const removeElementPart = (
  base: PinnedBase,
  alias: string,
  kind: 'select' | 'order' | 'group',
  chip: string,
): string => {
  // A select item may have a name: `e.field as label` is the item `e.field`.
  const column = (part: string) => splitOrderItem(part.replace(SELECT_NAME_RE, '')).column.toLowerCase();
  const target = column(chip);
  if (kind === 'group') {
    const index = stageGroupIndex(base.segments, alias);
    if (index < 0) return toText(base.segments);
    const { keys, aggregates } = groupBody(base.segments[index]);
    const rest = splitTopLevel(keys).filter(part => column(part) !== target);
    if (rest.length === 0) return toText(withoutCheckpointOp(base.segments, index));
    const next = [...base.segments];
    next[index] = { ...next[index], text: `group: ${rest.join(', ')}${aggregates ? ` with ${aggregates}` : ''}` };
    return toText(next);
  }
  if (elementStepIndex(base.segments, alias, kind) < 0) return toText(base.segments);
  return withElementStep(base, alias, kind, elementStepParts(base, alias, kind).filter(part => column(part) !== target));
};

/**
 * Reads the columns currently selected for `alias` off `base.segments` -
 * used to compute the toggled set from *this* base rather than from
 * whatever the (possibly one-gesture-stale) rendered canvasGraph shows, so
 * two rapid toggles on the same still-open picker each see the other's
 * result instead of one silently overwriting the other. Assumes plain
 * `alias.column` entries, same as setSelectColumns above.
 */
export const getSelectColumns = (base: PinnedBase, alias: string): string[] =>
  selectParts(base, alias)
    .filter(part => !isElementPart(base, part))
    .map(part => selectPartColumn(base, part, alias));

// `c_0.id as company_id`: the name a select item is given with `as`.
const SELECT_NAME_RE = /\s+as\s+([A-Za-z_][A-Za-z0-9_-]*)\s*$/i;

/** `c_0.id as company_id` -> `id`; `c_0.created_at => month` -> `created_at`. */
const selectPartColumn = (base: PinnedBase, part: string, alias: string): string =>
  columnAfterAlias(base, part.replace(SELECT_NAME_RE, '').split(/\s+=>\s+/)[0].trim(), alias);

/**
 * A name typed for a select item, made safe to write after `as`: letters,
 * digits and `_` only, not starting with a digit. Empty means no name.
 */
export const selectName = (typed: string): string => {
  const name = typed.trim().replace(/[^A-Za-z0-9_]+/g, '_');
  return /^[0-9]/.test(name) ? `_${name}` : name;
};

/**
 * Rewrites the `occurrence`th select item of `alias` on `column` (the same
 * column can be selected more than once, each under its own name) with
 * `edit`; null removes it. The other items stay as written.
 */
const editSelectPart = (
  base: PinnedBase,
  alias: string,
  column: string,
  occurrence: number,
  edit: (part: string) => string | null,
): string => {
  const parts = selectParts(base, alias);
  let seen = 0;
  const index = parts.findIndex(
    part => !isElementPart(base, part) && selectPartColumn(base, part, alias) === column && seen++ === occurrence,
  );
  if (index < 0) return toText(base.segments);
  const edited = edit(parts[index]);
  const next = edited === null ? parts.filter((_, i) => i !== index) : parts.map((p, i) => (i === index ? edited : p));
  return toText(upsertOwnedSegment(base.segments, alias, 'select', next.length ? `select: ${next.join(', ')}` : null));
};

/**
 * Adds `alias.column` for each of `columns` to the select step, even one
 * already there: a second copy can get its own name. The items already
 * there stay as written.
 */
export const addSelectColumns = (base: PinnedBase, alias: string, columns: string[]): string => {
  if (columns.length === 0) return toText(base.segments);
  const parts = selectParts(base, alias);
  // Before the elements' items, which are listed apart (see setSelectColumns).
  const at = parts.findIndex(part => isElementPart(base, part));
  const next = [...parts];
  next.splice(at < 0 ? parts.length : at, 0, ...columns.map(c => `${alias}.${c}`));
  return toText(upsertOwnedSegment(base.segments, alias, 'select', `select: ${next.join(', ')}`));
};

export const addSelectColumn = (base: PinnedBase, alias: string, column: string): string =>
  addSelectColumns(base, alias, [column]);

/** Removes one select item: the × on its chip. */
export const removeSelectColumn = (base: PinnedBase, alias: string, column: string, occurrence: number): string =>
  editSelectPart(base, alias, column, occurrence, () => null);

/** Names one select item with `as`, or drops its name when `name` is empty. */
export const setSelectName = (
  base: PinnedBase,
  alias: string,
  column: string,
  occurrence: number,
  name: string,
): string => {
  const safe = selectName(name);
  return editSelectPart(base, alias, column, occurrence, part => {
    const bare = part.replace(SELECT_NAME_RE, '').trim();
    return safe ? `${bare} as ${safe}` : bare;
  });
};

/**
 * Names one select item on the elements of an `unnest:`, `e.field`, with
 * `as`, or drops its name when `name` is empty. `occurrence` is which copy
 * of `chip`, as for setSelectName.
 */
export const setElementSelectName = (
  base: PinnedBase,
  alias: string,
  chip: string,
  occurrence: number,
  name: string,
): string => {
  const safe = selectName(name);
  const bareOf = (part: string) => part.replace(SELECT_NAME_RE, '').trim();
  const parts = elementStepParts(base, alias, 'select');
  let seen = 0;
  const index = parts.findIndex(
    part => isElementPart(base, part) && bareOf(part).toLowerCase() === chip.toLowerCase() && seen++ === occurrence,
  );
  if (index < 0) return toText(base.segments);
  const next = parts.map((p, i) => (i === index ? (safe ? `${bareOf(p)} as ${safe}` : bareOf(p)) : p));
  return withElementStep(base, alias, 'select', next);
};

/** Which copy of its column the chip at `index` is: `id`, `id as a`, `id as b` are copies 0, 1 and 2. */
export const occurrenceAt = (columns: string[], index: number): number =>
  columns.slice(0, index).filter(c => c === columns[index]).length;

/**
 * `c_0.data.plan` -> `data.plan`: the column, and any path into its JSON
 * value, without the alias in front. Text the canvas wrote always starts
 * with the owning alias. Typed text may start with another table's alias,
 * or with no alias at all: `data.plan` is a column and its JSON path.
 */
const columnAfterAlias = (base: PinnedBase, part: string, alias: string): string => {
  if (part.startsWith(`${alias}.`)) return part.slice(alias.length + 1);
  const dot = part.indexOf('.');
  if (dot < 0) return part;
  const aliases = (base.ast['selected-tables'] ?? []).map(t => t.alias);
  return aliases.includes(part.slice(0, dot)) ? part.slice(dot + 1) : part;
};

/** `$name`: a value typed as a variable in the where editor. */
export const VARIABLE_VALUE = /^\$([A-Za-z_][A-Za-z0-9_]*)$/;

/**
 * A where value as typed, written as Pine: `$name` as a variable, a number
 * or true/false/null bare, anything else quoted. After `in`/`not in`, a list:
 * `(1, 2)` as written, or `1, 2` put in brackets.
 */
export const buildWhereLiteral = (value: string, operator = '='): string => {
  if (VARIABLE_VALUE.test(value)) return value;
  if (/^(not )?in$/i.test(operator)) {
    if (value.startsWith('(')) return value;
    return `(${splitTopLevel(value).map(v => buildWhereLiteral(v)).join(', ')})`;
  }
  const isBareLiteral =
    /^-?\d+(\.\d+)?$/.test(value) || ['true', 'false', 'null'].includes(value.toLowerCase());
  return isBareLiteral ? value : `'${value.replace(/'/g, "''")}'`;
};

/** The variables a where draft names that the tab doesn't set yet: each gets a `$name = ` line. */
export const variablesIn = (conditions: WhereConditionDraft[]): string[] =>
  Array.from(new Set(conditions.flatMap(c => VARIABLE_VALUE.exec(c.value.trim())?.[1] ?? [])));

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

// Each filter is its own `where:` step - pine-lang ANDs every `where:` step
// together (same as it already does for two different tables), so adding one
// needs nothing more than appending a new segment.
//
// Several conditions go into ONE `where:` joined with `or` - that is the one
// thing a separate step can't express.
export const addWhereCondition = (base: PinnedBase, alias: string, conditions: WhereConditionDraft[]): string =>
  toText(appendOwnedSegment(base.segments, alias, 'where', whereSegmentText(conditions)));

/** `where: c.a = 1 or c.b = 'x'` - each condition qualified by its own alias. */
export const whereSegmentText = (conditions: WhereConditionDraft[]): string =>
  `where: ${conditions
    .map(
      ({ alias, column, operator, value }) =>
        `${whereLeft(alias, column)} ${operator} ${buildWhereLiteral(value, operator)}`,
    )
    .join(' or ')}`;

// A function on the left, `jsonb_typeof(c_0.data)`, comes back from
// pine-lang already written as Pine with its own aliases, so it isn't
// prefixed with one.
// An element of `unnest:` by itself has no column: just `e`.
// An index into it, `[0]`, follows it directly: `e[0]`.
const whereLeft = (alias: string, column: string): string =>
  column.includes('(') ? column : column === '' || column.startsWith('[') ? `${alias}${column}` : `${alias}.${column}`;

// `index` is this alias's where-conditions in pipeline order - the same
// order `ast.where` reports them in (see layout.ts's whereChips), since a new
// condition always lands right after this alias's existing segments (see
// appendOwnedSegment/insertAfterLastOwned) and so preserves that order too.
export const removeWhereConditionAt = (base: PinnedBase, alias: string, index: number): string => {
  const whereSegments = ownWhereSegments(base, alias);
  const target = whereSegments[index];
  if (!target) return toText(base.segments);
  return toText(base.segments.filter(s => s !== target));
};

/**
 * Rewrites the condition at `index` (same pipeline-order indexing as
 * removeWhereConditionAt) in place, keeping its position rather than
 * removing and re-appending it - lets a condition be edited without visibly
 * jumping to the end of its alias's chip row. The whole segment is
 * rewritten from `conditions`, so this also adds or removes `or` conditions.
 */
export const updateWhereConditionAt = (
  base: PinnedBase,
  alias: string,
  index: number,
  conditions: WhereConditionDraft[],
): string => {
  const whereSegments = ownWhereSegments(base, alias);
  const target = whereSegments[index];
  if (!target) return toText(base.segments);
  const next = base.segments.map(s => (s === target ? { ...s, text: whereSegmentText(conditions) } : s));
  return toText(next);
};

// Same "own `where:` step per filter" reasoning as addWhereCondition, just
// two steps instead of one - see DateBounds' own comment (relative-date.ts)
// for why a relative-date selection compiles to a `>`/`<` pair rather than a
// single `>=` condition.
export const addRelativeDateWhereCondition = (
  base: PinnedBase,
  alias: string,
  column: string,
  bounds: DateBounds,
): string => {
  const withLower = appendOwnedSegment(
    base.segments,
    alias,
    'where',
    `where: ${alias}.${column} > '${bounds.lowerExclusive}'`,
  );
  return toText(
    appendOwnedSegment(withLower, alias, 'where', `where: ${alias}.${column} < '${bounds.upperExclusive}'`),
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

/**
 * One `order:` item split into its column, direction and null ordering:
 * `c.name desc nulls first`. A chip's text has the same shape.
 */
export const splitOrderItem = (
  text: string,
): { column: string; direction?: 'asc' | 'desc'; nulls?: 'first' | 'last' } => {
  const match = /^(.*?)(?:\s+(asc|desc))?(?:\s+nulls\s+(first|last))?$/i.exec(text.trim());
  const [, column, direction, nulls] = match ?? [text, text];
  return {
    column,
    ...(direction ? { direction: direction.toLowerCase() as 'asc' | 'desc' } : {}),
    ...(nulls ? { nulls: nulls.toLowerCase() as 'first' | 'last' } : {}),
  };
};

/** Reads the columns `alias` is currently ordered by (direction stripped) - see getSelectColumns for why this reads from `base.segments`, not the rendered canvasGraph. */
export const getOrderColumns = (base: PinnedBase, alias: string): string[] => {
  const existing = base.segments.find(s => s.owner === alias && s.kind === 'order');
  if (!existing) return [];
  const body = existing.text.replace(/^(order:|o:)\s*/i, '');
  return splitTopLevel(body)
    .filter(part => !isElementPart(base, part))
    .map(part => {
      return columnAfterAlias(base, splitOrderItem(part).column, alias);
    });
};

/**
 * The position in `columns` (every item of the order: step) of the table's
 * own `index`th item: its order chips leave out items on elements (see
 * isElementPart).
 */
const ownOrderIndex = (base: PinnedBase, columns: string[], index: number): number => {
  const own = columns.flatMap((part, i) => (isElementPart(base, part) ? [] : [i]));
  return own[index] ?? -1;
};

/** Flips an existing order column's direction in place - the index stays stable, unlike remove+re-add. */
export const setOrderDirectionAt = (
  base: PinnedBase,
  alias: string,
  index: number,
  direction: 'asc' | 'desc',
): string => {
  const existing = base.segments.find(s => s.owner === alias && s.kind === 'order');
  if (!existing) return toText(base.segments);
  const columns = splitTopLevel(existing.text.replace(/^(order:|o:)\s*/i, ''));
  const at = ownOrderIndex(base, columns, index);
  const target = columns[at];
  if (target === undefined) return toText(base.segments);
  // `nulls first` stays: only the direction flips.
  const { column, nulls } = splitOrderItem(target);
  columns[at] = `${column} ${direction}${nulls ? ` nulls ${nulls}` : ''}`;
  return toText(upsertOwnedSegment(base.segments, alias, 'order', `order: ${columns.join(', ')}`));
};

export const removeOrderColumnAt = (base: PinnedBase, alias: string, index: number): string => {
  const existing = base.segments.find(s => s.owner === alias && s.kind === 'order');
  if (!existing) return toText(base.segments);
  const columns = splitTopLevel(existing.text.replace(/^(order:|o:)\s*/i, ''));
  const at = ownOrderIndex(base, columns, index);
  if (at < 0) return toText(base.segments);
  columns.splice(at, 1);
  return toText(
    upsertOwnedSegment(base.segments, alias, 'order', columns.length ? `order: ${columns.join(', ')}` : null),
  );
};

/**
 * Ends the query with `describe:` or `references:` on `alias`'s table. They
 * describe the table the pipe left off at, so a `from:` picks `alias` first
 * when the pipe ends elsewhere. `base` has no describe step of its own (see
 * CanvasStore.pinnedBase).
 */
export const describeTable = (base: PinnedBase, op: 'describe' | 'references', alias: string): string => {
  const last = base.segments[base.segments.length - 1];
  const from = last?.owner === alias ? [] : [`from: ${alias}`];
  return [toText(base.segments), ...from, `${op}:`].join(' | ');
};

/**
 * Removes `alias`'s table (see removeNode). A checkpoint with no table left
 * before it - `limit: 10` once `company as c | limit: 10` loses its only
 * table - is removed with it, since it has nothing left to seal. Returns
 * null when `alias` can't be removed - see isRemovableNode.
 */
export const deleteNode = (base: PinnedBase, alias: string): string | null =>
  isRemovableNode(base.segments, alias) ? toText(withoutOrphanCheckpoints(removeNode(base.segments, alias))) : null;

const withoutOrphanCheckpoints = (segments: Segment[]): Segment[] => {
  let out = segments;
  for (;;) {
    const firstTable = out.findIndex(s => s.kind === 'table');
    const orphan = out.findIndex((s, i) => isCheckpointOp(s) && (firstTable < 0 || i < firstTable));
    if (orphan < 0) return out;
    const name = out[orphan].owner;
    out = name ? withoutCheckpoint(out, name) : out.filter((_, i) => i !== orphan);
  }
};

/**
 * Removes the checkpoint named `name`: its group:/limit:, its `= name`, and
 * every step that works on its sealed result (the select/where/order its
 * node carries, and any `from: name`). Tables joined after it stay, and now
 * join from the table before the checkpoint, as if it had never been there.
 * Returns the text unchanged if no segment belongs to `name`.
 */
export const deleteCheckpoint = (base: PinnedBase, name: string): string => toText(withoutCheckpoint(base.segments, name));

const withoutCheckpoint = (segments: Segment[], name: string): Segment[] =>
  segments.filter(s => {
    if (s.kind === 'from') return !new RegExp(`^(?:from:|f:)\\s*${name}\\b`, 'i').test(s.text);
    return s.owner !== name;
  });

/**
 * The segments without the checkpoint op at `index`, and without the
 * checkpoint's `= name` when that leaves it nothing to name.
 *
 * Every gesture pins a checkpoint's name first (`|= result_1`, see
 * getPinnedBase), so removing its only limit: or group: used to leave
 * `company as c | = result_1` behind. The name goes too, but only when it is
 * pine-lang's auto name (result_1, ...) and nothing comes after it. A name
 * someone wrote, or one later steps use, stays. So does a name right after
 * another group:/limit: (`group: ... | limit: 5 | = x` without its limit
 * still names the group).
 */
const withoutCheckpointOp = (segments: Segment[], index: number): Segment[] => {
  const rest = [...segments.slice(0, index), ...segments.slice(index + 1)];
  const next = rest[index];
  const isLast = index === rest.length - 1;
  const namesAnother = index > 0 && isCheckpointOp(rest[index - 1]);
  if (next?.kind === 'assign' && isLast && !namesAnother && AUTO_CHECKPOINT_NAME.test(next.text.replace(/^=\s*/, '').trim())) {
    return rest.slice(0, -1);
  }
  return rest;
};

/**
 * `limit: 9` from `limit: 5` or `l: 5 per c.id`. With `per`, the columns
 * after `per` are replaced (none: a plain limit). Without it, whatever
 * follows the number is kept - `per ...` above all.
 */
const withLimitValue = (text: string, value: number, per?: string[]): string => {
  if (per) return `limit: ${value}${per.length ? ` per ${per.join(', ')}` : ''}`;
  const rest = text.replace(/^(?:limit:|l:)\s*\d+/i, '');
  return `limit: ${value}${rest}`;
};

/** The columns after `per` in a limit segment's text, as written: `c.id, c.name`. */
export const limitPer = (text: string): string[] => {
  const m = /\s+per\s+([\s\S]*)$/i.exec(text);
  return m ? splitTopLevel(m[1]) : [];
};

/**
 * Sets, changes or (with null) removes a limit.
 *
 * - `checkpoint` names the checkpoint whose own limit: is changed - the
 *   divider's label.
 * - Otherwise `alias` picks the limit: that ends `alias`'s stage (see
 *   stageLimitIndex).
 * - With neither, the first limit: anywhere - the multi-select toolbar.
 *
 * With no such limit, a new one goes at the very end, and limits the whole
 * query's result. Not at the end of `alias`'s stage: when a group: ends that
 * stage, a limit before it would group only the first N rows, a different
 * question from "the first N groups", and nothing would say so.
 *
 * Changing a limit rewrites only its number, in place, so `per ...` and the
 * checkpoint's `= name` right after it stay where they are.
 */
export const setLimit = (
  base: PinnedBase,
  value: number | null,
  alias?: string,
  checkpoint?: string,
  // The columns after `per`, from the limit editor. Omitted: kept as they are.
  per?: string[],
): string => {
  const index = checkpoint
    ? base.segments.findIndex(s => s.kind === 'limit' && s.owner === checkpoint)
    : stageLimitIndex(base.segments, alias);
  if (value === null) return index < 0 ? toText(base.segments) : toText(withoutCheckpointOp(base.segments, index));
  if (index >= 0) {
    const next = [...base.segments];
    next[index] = { ...next[index], text: withLimitValue(next[index].text, value, per) };
    return toText(next);
  }
  const newSegment: Segment = { text: withLimitValue('', value, per ?? []), start: -1, end: -1, kind: 'limit', owner: null };
  return toText([...base.segments, newSegment]);
};

/**
 * `group:` applies to a whole stage, not one table, and more than one table
 * can contribute to it - "company -> tenant, grouped by both tenant_id and
 * company_id" is one shared `group: t.tenant_id, c.company_id` segment, not
 * two. It is the checkpoint that ends `alias`'s stage, when that is a group.
 * getGroupColumns/setGroupColumns read and rewrite only `alias`'s own
 * qualified entries within that one list, leaving every other alias's
 * columns untouched - so there's no need to track "where" a given alias's
 * contribution lives; it's re-derived from the segment's own text every time.
 */
const stageGroupIndex = (segments: Segment[], alias: string): number => {
  const end = stageEnd(segments, alias);
  return segments[end]?.kind === 'group' ? end : -1;
};

/**
 * A group: segment's body split into its keys and what follows `with`:
 * `c.name, c.id with count, total => max` is ['c.name, c.id', 'count, total
 * => max']. A `with` inside a string isn't one. With no keys, `with count as
 * n` is ['', 'count as n']: one group, the whole table.
 */
export const splitGroupBody = (body: string): { keys: string; aggregates: string | null } => {
  const keyless = /^\s*with\s+/i.exec(body);
  if (keyless) return { keys: '', aggregates: body.slice(keyless[0].length).trim() };
  let inQuote = false;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "'") inQuote = !inQuote;
    if (inQuote) continue;
    const m = /^\s+with\s+/i.exec(body.slice(i));
    if (m) return { keys: body.slice(0, i).trim(), aggregates: body.slice(i + m[0].length).trim() };
  }
  return { keys: body.trim(), aggregates: null };
};

const groupBody = (segment: Segment) => splitGroupBody(segment.text.replace(/^(group:|g:)\s*/i, ''));

export const getGroupColumns = (base: PinnedBase, alias: string): string[] => {
  const index = stageGroupIndex(base.segments, alias);
  if (index < 0) return [];
  return splitTopLevel(groupBody(base.segments[index]).keys)
    .filter(part => part.startsWith(`${alias}.`))
    .map(part => part.slice(alias.length + 1));
};

// Replaces an existing group: segment IN PLACE rather than re-appending it,
// so the checkpoint's `= name` right after it stays attached to it. A new
// group: goes at the end of `alias`'s stage.
export const setGroupColumns = (base: PinnedBase, alias: string, columns: string[]): string => {
  const index = stageGroupIndex(base.segments, alias);
  const existing = index >= 0 ? base.segments[index] : undefined;
  // Only the keys change; the aggregates after `with` stay as typed.
  const prior = existing ? groupBody(existing) : { keys: '', aggregates: null };
  const priorAll = splitTopLevel(prior.keys);
  const others = priorAll.filter(part => !part.startsWith(`${alias}.`));
  const mine = columns.map(c => `${alias}.${c}`);
  const nextAll = [...others, ...mine];
  if (nextAll.length === 0) return index < 0 ? toText(base.segments) : toText(withoutCheckpointOp(base.segments, index));
  if (index >= 0) {
    const next = [...base.segments];
    const tail = prior.aggregates ? ` with ${prior.aggregates}` : '';
    next[index] = { ...next[index], text: `group: ${nextAll.join(', ')}${tail}` };
    return toText(next);
  }
  const at = stageEnd(base.segments, alias);
  const newSegment: Segment = { text: `group: ${nextAll.join(', ')}`, start: -1, end: -1, kind: 'group', owner: null };
  return toText([...base.segments.slice(0, at), newSegment, ...base.segments.slice(at)]);
};

/**
 * The name the elements of `unnest: <column>` get on the canvas: the
 * array's name in the singular, `changes` -> `change`, `companies` ->
 * `company`. A name in the singular joins on its own (pine-lang's
 * docs/joins.md, "Joining on a name you give"): `companies` -> `company`
 * joins `company` on each element's `id`. A name that is already singular,
 * or taken, gets a number: `data` -> `data_1`, so `data.x` still reads the
 * column.
 */
export const unnestName = (column: string, taken: Set<string>): string => {
  // A quoted key, `'home addresses'`, is named without its quotes and spaces.
  const last = (column.split('.').pop() ?? column).replace(/^'|'$/g, '').replace(/[^A-Za-z0-9_]+/g, '_');
  const lower = last.toLowerCase();
  const singular = /ies$/.test(lower)
    ? `${last.slice(0, -3)}y`
    : /(ss|x|z|ch|sh)es$/.test(lower)
      ? last.slice(0, -2)
      : /s$/.test(lower) && !/(ss|us|is)$/.test(lower)
        ? last.slice(0, -1)
        : last;
  if (singular !== last && !taken.has(singular)) return singular;
  let n = 1;
  while (taken.has(`${singular}_${n}`)) n++;
  return `${singular}_${n}`;
};

/**
 * What is typed in a picker, `data.address.city`, as Pine: one of `starts`
 * (a column, or the elements of an `unnest:`) and a path inside it. Keys
 * inside JSON aren't in the schema, so they are typed, not picked.
 *
 * The text becomes part of the query, so each key is written in a form
 * Pine reads as a key and nothing else: a plain name as it is, anything
 * else quoted, `data.'home address'`, with a quote inside doubled. `[n]`
 * after a key is an array index. Null unless it starts with one of
 * `starts`, or when a step is empty.
 */
export const typedPath = (typed: string, starts: string[]): { start: string; text: string } | null => {
  const [first, ...steps] = typed.trim().split('.');
  const [, start, firstIndexes] = first.match(/^(.*?)((?:\[\d+\])*)$/) ?? [];
  if (!start || !starts.includes(start)) return null;
  let text = `${start}${firstIndexes}`;
  for (const step of steps) {
    const [, key, indexes] = step.match(/^(.*?)((?:\[\d+\])*)$/) ?? [];
    if (!key) return null;
    text += /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? `.${key}${indexes}` : `.'${key.replace(/'/g, "''")}'${indexes}`;
  }
  return { start, text };
};

/**
 * Adds `text` (`e.field`, or `e.field desc` for order) to `alias`'s own
 * select:, order: or group: step, or removes it when it's there - the
 * element counterpart of toggling a column.
 */
export const toggleElementPart = (
  base: PinnedBase,
  alias: string,
  kind: 'select' | 'order' | 'group',
  text: string,
  addOnly = false,
): string => {
  // A select item may have a name: `e.field as label` is the item `e.field`.
  const column = (part: string) => splitOrderItem(part.replace(SELECT_NAME_RE, '')).column.toLowerCase();
  const present =
    kind === 'group'
      ? (() => {
          const index = stageGroupIndex(base.segments, alias);
          return index >= 0 && splitTopLevel(groupBody(base.segments[index]).keys).some(p => column(p) === column(text));
        })()
      : elementStepParts(base, alias, kind).some(p => column(p) === column(text));
  if (present) return addOnly ? toText(base.segments) : removeElementPart(base, alias, kind, text);
  if (kind === 'group') {
    const index = stageGroupIndex(base.segments, alias);
    if (index >= 0) {
      const { keys, aggregates } = groupBody(base.segments[index]);
      const next = [...base.segments];
      const all = [...splitTopLevel(keys), text];
      next[index] = { ...next[index], text: `group: ${all.join(', ')}${aggregates ? ` with ${aggregates}` : ''}` };
      return toText(next);
    }
    const at = stageEnd(base.segments, alias);
    const segment: Segment = { text: `group: ${text}`, start: -1, end: -1, kind: 'group', owner: null };
    return toText([...base.segments.slice(0, at), segment, ...base.segments.slice(at)]);
  }
  const part = kind === 'order' ? `${text} desc` : text;
  return withElementStep(base, alias, kind, [...elementStepParts(base, alias, kind), part]);
};

/** `unnest: c.data.changes as change`, after `alias`'s own steps. */
/**
 * Adds `unnest: alias.<path> as <name>` to `alias`'s stage. `path` is a
 * column, or a path inside one (`options.officers`). With `fromElement`, it
 * starts at elements already unnested on this node (`o.items`), which are
 * named without the table's alias.
 */
export const addUnnest = (base: PinnedBase, alias: string, path: string, name: string, fromElement = false): string =>
  toText(appendOwnedSegment(base.segments, alias, 'unnest', `unnest: ${fromElement ? '' : `${alias}.`}${path} as ${name}`));

/** The name of the elements an UNNEST chip shows: `e` in `data.changes as e :left`. */
export const unnestChipName = (chip: string): string =>
  chip.replace(/\s+:left\s*$/i, '').split(/\s+as\s+/).pop() ?? '';

/**
 * Renames the elements of an `unnest:`: `as company` becomes `as typed`, made
 * safe as for a select item's name. The steps after it that read the
 * elements, `company.id`, follow. A table step, quoted text, a column named
 * the same (`c.company`) and a name given with `as` are left alone.
 */
export const renameUnnest = (base: PinnedBase, name: string, typed: string): string => {
  const next = selectName(typed);
  const at = base.segments.findIndex(s => s.kind === 'unnest' && unnestChipName(s.text) === name);
  if (!next || next === name || at < 0) return toText(base.segments);
  const reference = new RegExp(`(?<![\\w.$-])(?<!\\bas\\s+)${name}(?![\\w-])`, 'g');
  const segments = base.segments.map((s, i) => {
    if (i === at) return { ...s, text: s.text.replace(new RegExp(`(\\bas\\s+)${name}(?=(\\s+:left)?\\s*$)`, 'i'), `$1${next}`) };
    if (i < at || s.kind === 'table') return s;
    return { ...s, text: mapOutsideQuotes(s.text, chunk => chunk.replace(reference, next)) };
  });
  return toText(segments);
};

/**
 * Removes the `unnest:` that names its elements `name`. A step after it that
 * still reads `name` is left as typed, and pine-lang's error says so.
 */
export const removeUnnest = (base: PinnedBase, name: string): string =>
  toText(
    base.segments.filter(
      s => !(s.kind === 'unnest' && new RegExp(`\\bas\\s+${name}(\\s+:left)?\\s*$`, 'i').test(s.text.trim())),
    ),
  );
