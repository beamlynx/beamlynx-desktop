import { Ast, HttpClient, TableHint } from '../client';
import { formatSql } from '../../utils/formatSql';

// Walking the tables that hang off the current one by foreign key, and doing
// something at each: counting rows, or building the DELETE that would empty
// it.
//
// This used to be a Pine operation. `delete:` parsed into an operation that
// built no SQL -- purely a marker the client noticed on the end of an
// expression (see plugin/recursive-delete.plugin.ts, now gone). That was the
// wrong shape twice over. A Pine expression describes one result set; this is
// a procedure that runs many. And a marker for a client-side routine is not a
// language feature -- pine-lang removed `delete:` outright rather than growing
// a generic `traverse:` token it would only have had to ignore.
//
// Nothing here needs a new server operation. Every query the walk issues is an
// expression Pine already understands:
//
//   children of a node   POST /build with a trailing `|`, read ast.hints.table
//   rows at a node       <expr> | count:
//   the DELETE for one   <expr> | limit: N | delete! .<column>

/** One table the walk reached. `expression` is real Pine, runnable on its own. */
export type TraversalNode = {
  /** Stable within one traversal: the node's own expression. */
  id: string;
  parentId: string | null;
  table: string;
  schema: string | null;
  /** The foreign key column linking this table to its parent; '' at the root. */
  column: string;
  expression: string;
  depth: number;
  count: number;
};

export type TraversalVerb = 'count' | 'delete';

export type TraversalStatus = 'walking' | 'done' | 'cancelled' | 'failed';

/**
 * How deep the walk goes before stopping.
 *
 * Fixed, with no control to change it. The walk has a visited set, so it
 * terminates on a foreign-key cycle regardless -- this is the second guard,
 * for a schema that is acyclic but deep enough that walking all of it is
 * never what someone meant. What matters is that hitting it is *visible*:
 * `depthCapped` below, which the panel reports, rather than a truncated tree
 * presented as a complete one.
 */
export const MAX_DEPTH = 10;

export type TraversalResult = {
  nodes: TraversalNode[];
  /** True when the walk stopped somewhere because of MAX_DEPTH. */
  depthCapped: boolean;
};

// ---------------------------------------------------------------------------
// Whether deleting along this expression is correct at all
// ---------------------------------------------------------------------------

export type DeleteEligibility = { ok: true } | { ok: false; reason: string };

/**
 * Whether `Delete rows...` is correct for this expression -- not whether it is
 * convenient. On the wrong shape the walk empties a table the root's own query
 * depends on, and the result is a delete that removes nothing and reports
 * success.
 *
 * `employee | company` is the case. `current` is company, so the walk asks for
 * company's children and finds `employee` -- a table already in the pipe:
 *
 *   1. DELETE FROM employee WHERE company_id IN (
 *        SELECT e_1.company_id FROM employee e_0
 *          JOIN company c_0 ON e_0.company_id = c_0.id
 *          JOIN employee e_1 ON e_1.company_id = c_0.id )   <- empties e_0 too
 *
 *   2. DELETE FROM company WHERE id IN (
 *        SELECT c_0.id FROM employee e_0
 *          JOIN company c_0 ON e_0.company_id = c_0.id )    <- e_0 is gone
 *
 * Step 2 matches nothing. The companies survive, silently. A mapping table in
 * the pipe does the same thing: its rows go first, and the parent's subquery
 * then joins through nothing.
 *
 * The invariant is that no table the walk visits may appear in the root
 * expression. The walk only ever descends, so that holds exactly when the root
 * is a strict descending chain with `current` at its end -- the two conditions
 * below. `runTraversal` enforces the invariant itself at run time as well,
 * since these conditions are an argument about the foreign-key graph and the
 * cost of the argument being wrong is a silent wrong delete.
 */
export const canDeleteTraverse = (ast: Ast | null | undefined): DeleteEligibility => {
  if (!ast || !ast.current) return { ok: false, reason: 'Pick a table first.' };
  const joins = ast.joins ?? [];

  // 1. Every join points parent -> child. JoinRelation's third element is
  //    'has' (the `from` alias is the parent) or 'of' (it is the child) --
  //    the same field layout.ts reads as `parentIsFrom`. An unresolved
  //    relation (null) is disqualifying: an unknown direction is not a safe
  //    one to assume is downward.
  for (const [from, to, relation] of joins) {
    if (!relation) {
      return { ok: false, reason: `The join between ${from} and ${to} could not be resolved.` };
    }
    if (relation[2] !== 'has') {
      return {
        ok: false,
        reason: `Delete needs every join to go from parent to child, and this one joins ${to} back up from ${from}.`,
      };
    }
  }

  // 2. `current` is the last table in the pipe. A `from:` pointing back up
  //    the chain breaks the invariant just as thoroughly even when every
  //    join is downward: on `company | employee | document | from: employee`
  //    the walk visits `document`, which is in the root expression, and
  //    empties it before employee's own subquery runs.
  //
  //    Checked against the last join's target rather than
  //    ast['selected-tables'], which deliberately omits the pipe's final
  //    table (see pipeline.md) and so cannot answer this.
  const lastJoin = joins[joins.length - 1];
  if (lastJoin && lastJoin[1] !== ast.current) {
    return {
      ok: false,
      reason: `Delete starts from the end of the pipe, and this expression points back at ${ast.current}. Remove the \`from:\` to delete from ${lastJoin[1]}.`,
    };
  }

  return { ok: true };
};

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

/** Thrown when the run-time invariant behind canDeleteTraverse is violated. */
export class TraversalRevisitError extends Error {
  constructor(public readonly table: string) {
    super(
      `Stopping: the walk reached "${table}", which the expression already uses. ` +
        `Continuing would empty a table the query itself depends on.`,
    );
    this.name = 'TraversalRevisitError';
  }
}

export type WalkOptions = {
  connectionId?: string;
  maxDepth?: number;
  /** Aborts the walk between steps. */
  signal?: { cancelled: boolean };
  /**
   * Tables the root expression already uses. The walk aborts rather than
   * visiting one -- see canDeleteTraverse for what goes wrong. Passed only
   * for the delete verb; counting re-reads nothing, so revisiting a table is
   * merely redundant there, not wrong.
   */
  forbidden?: Set<string>;
  /** Called as each node's count lands, so a panel can fill in as it goes. */
  onNode?: (node: TraversalNode) => void;
};

/**
 * The key both `visited` and `forbidden` use.
 *
 * The bare table name, not `schema.table`, because the two sides would not
 * agree otherwise: a child comes from a `hints.table` entry, which carries a
 * schema, while the root is resolved from the AST, where it often does not.
 * Mixing the two forms would silently defeat both sets.
 *
 * The cost is conflating same-named tables in different schemas. Both
 * consequences land on the safe side: `visited` would stop a branch early
 * rather than walk it twice, and `forbidden` would refuse a delete rather than
 * allow a wrong one.
 */
const tableKey = (table: string): string => table.toLowerCase();

/** Every table the root expression already uses -- see WalkOptions.forbidden. */
export const tablesInExpression = (ast: Ast | null | undefined, rootTable: string): Set<string> => {
  const keys = (ast?.['selected-tables'] ?? []).map(t => tableKey(t.table));
  return new Set([...keys, tableKey(rootTable)]);
};

/**
 * Depth-first, children before parents, pruning a branch as soon as a node has
 * no rows.
 *
 * Post-order is not a detail: it is the order the DELETEs have to run in, so a
 * child is always emptied before the parent it points at. Counting inherits
 * the same order for free, which also makes the panel read bottom-up the way
 * the script does.
 */
export const runTraversal = async (
  client: HttpClient,
  rootExpression: string,
  options: WalkOptions = {},
): Promise<TraversalResult> => {
  const maxDepth = options.maxDepth ?? MAX_DEPTH;
  const nodes: TraversalNode[] = [];
  let depthCapped = false;

  const visit = async (
    expression: string,
    parentId: string | null,
    table: string,
    schema: string | null,
    column: string,
    depth: number,
    // Tables on the path from the root to here, for cycle termination.
    // Scoped to the path, NOT global: a table reachable by two different
    // routes is a diamond, not a cycle, and both routes are real.
    // `company | project | assignment` and `company | employee | assignment`
    // select different assignment rows and need a DELETE each -- dropping
    // the second leaves rows behind, and the parent's own DELETE then fails
    // on the foreign key. A global visited set silently did exactly that.
    path: ReadonlySet<string>,
  ): Promise<void> => {
    if (options.signal?.cancelled) return;

    const count = await client.count(expression, options.connectionId);
    if (count === 0) return;

    const node: TraversalNode = {
      id: expression,
      parentId,
      table,
      schema,
      column,
      expression,
      depth,
      count,
    };
    options.onNode?.(node);

    if (depth >= maxDepth) {
      depthCapped = true;
      nodes.push(node);
      return;
    }

    const { expressions } = await client.makeChildExpressions(expression, options.connectionId);
    for (const child of expressions) {
      if (options.signal?.cancelled) return;
      const key = tableKey(child.table);
      if (options.forbidden?.has(key)) throw new TraversalRevisitError(key);
      // Termination on a foreign-key cycle: this table is already an ancestor
      // of itself. Keyed on the table, not the expression, because an
      // expression grows a new alias on every hop and so never repeats.
      if (path.has(key)) continue;
      await visit(
        child.expression,
        expression,
        child.table,
        child.schema,
        child.column,
        depth + 1,
        new Set([...Array.from(path), key]),
      );
    }

    // After its children, never before -- see the post-order note above.
    nodes.push(node);
  };

  const root = await rootTableOf(client, rootExpression, options.connectionId);
  await visit(
    rootExpression,
    null,
    root.table,
    root.schema,
    root.column,
    0,
    new Set([tableKey(root.table)]),
  );

  return { nodes, depthCapped };
};

/**
 * The table the root expression currently sits on, for labelling the root node.
 *
 * `column` is the one the root's own DELETE keys on, and it is hardcoded to
 * `id` -- carried forward from the routine this replaces, where the same
 * limitation lived as a FIXME. A table whose primary key is not `id` still
 * cannot be deleted through. It does not affect counting, which never uses it.
 */
const rootTableOf = async (
  client: HttpClient,
  expression: string,
  connectionId?: string,
): Promise<{ table: string; schema: string | null; column: string }> => {
  const response = await client.build([expression], undefined, connectionId);
  const ast = response?.ast;
  const alias = ast?.current;
  // `selected-tables` omits the pipe's final table (pipeline.md), so the
  // current alias is usually not in it -- fall back to the last join's target
  // table, and then to the alias itself, which is at worst a cosmetic label.
  const fromSelected = ast?.['selected-tables']?.find(t => t.alias === alias);
  if (fromSelected) {
    return { table: fromSelected.table, schema: fromSelected.schema ?? null, column: 'id' };
  }
  const hint = lastJoinTarget(ast);
  return { table: hint?.table ?? alias ?? 'table', schema: hint?.schema ?? null, column: 'id' };
};

const lastJoinTarget = (ast: Ast | undefined): { table: string; schema: string | null } | null => {
  const joins = ast?.joins ?? [];
  const last = joins[joins.length - 1];
  if (!last) {
    // No joins: a single-table expression. The table name is not in
    // `selected-tables` either, so derive it from the alias, which pine-lang
    // builds as <first letter(s)>_<index>.
    const alias = ast?.current ?? '';
    return alias ? { table: alias.replace(/_\d+$/, ''), schema: null } : null;
  }
  const hints = (ast?.hints?.table ?? []) as TableHint[];
  const match = hints.find(h => h.table === last[1]);
  return { table: last[1].replace(/_\d+$/, ''), schema: match?.schema ?? null };
};

// ---------------------------------------------------------------------------
// The verbs
// ---------------------------------------------------------------------------

/** The `BEGIN; ... COMMIT;` script for a completed delete traversal. */
export const buildDeleteScript = async (
  client: HttpClient,
  nodes: TraversalNode[],
  connectionId?: string,
): Promise<string> => {
  const parts: string[] = ['/* DELETE queries */', 'BEGIN;'];
  for (const node of nodes) {
    const query = await client.buildDeleteQuery(
      node.expression,
      node.column,
      node.count,
      connectionId,
    );
    parts.push(`/*\n${node.expression}\n*/`);
    parts.push(query);
  }
  parts.push('COMMIT;');
  // Comments pass through untouched; only the statements are formatted. Same
  // split the routine this replaces used, so the output is comparable.
  return parts.map(part => (part.trim().startsWith('/*') ? part : formatSql(part))).join('\n\n');
};
