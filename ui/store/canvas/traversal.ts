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
  /**
   * The column this node's own DELETE keys on: the foreign key linking it to
   * its parent, or - at the root, which has no parent - the hardcoded `id`
   * that rootTableOf supplies. See that function for why it is hardcoded.
   */
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
 * Not really a safety limit -- cycles are already handled, by tracking the
 * tables on the path from the root -- so it is just a depth past which nobody
 * meant to keep going. Real schemas nest further than a first guess suggests,
 * so this is set well clear of them rather than tuned tight; hitting it should
 * mean something is wrong, not that the schema is ordinary.
 *
 * What matters more than the number is that hitting it is *visible*:
 * `depthCapped` below, which the panel reports, rather than a truncated tree
 * presented as a complete one.
 */
export const MAX_DEPTH = 25;

export type TraversalResult = {
  nodes: TraversalNode[];
  /** True when the walk stopped somewhere because of MAX_DEPTH. */
  depthCapped: boolean;
};

/**
 * The traversal's own client. Deliberately not the session's: that one carries
 * an onBuild callback that writes every build's AST back into the session, and
 * a traversal issues a build per node - which would leave the canvas rendering
 * whichever child table the walk happened to finish on.
 */
export const traversalClient = new HttpClient();

/** A traversal in flight or finished - see Session.startTraversal. */
export type TraversalState = {
  verb: TraversalVerb;
  rootExpression: string;
  status: TraversalStatus;
  nodes: TraversalNode[];
  depthCapped: boolean;
  /** The BEGIN;...COMMIT; script, for the delete verb once the walk finishes. */
  script: string | null;
  error: string | null;
  /**
   * Where the "do it for real" half is up to. 'idle' means the script has been
   * generated and nothing has run -- which is where a delete traversal stops
   * unless the person explicitly goes further.
   */
  /**
   * Where the "do it for real" half is up to.
   *
   * 'failed' is its own state rather than being inferred from how far the run
   * got: the first table can be the one that fails, and then "how far" is
   * zero, which is indistinguishable from never having started. That is
   * exactly the case where resuming matters most.
   */
  run: 'idle' | 'confirming' | 'running' | 'paused' | 'failed' | 'finished';
  outcomes: DeleteOutcome[];
  /**
   * The next node to attempt. Advances past each success, so a run that was
   * paused or that stopped on an error resumes exactly where it left off
   * instead of re-issuing deletes that already ran.
   */
  runFrom: number;
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

/**
 * Thrown when a child table is reached through what is really one composite
 * foreign key, which pine-lang reports as several independent single-column
 * relations (see its docs/joins.md - combining them into one join is a
 * separate change).
 *
 * Deleting through one column of a composite key over-matches, and the
 * over-match is silent. Given
 * `case_ref (case_id, search_id) -> kase (id, search_id)`, deleting
 * `kase | where: id = 1` produces two DELETEs, and the second is
 * `WHERE search_id IN (...)` alone - which also takes out rows belonging to a
 * *different* kase that happens to share a search_id. Confirmed against a real
 * database: a row whose parent survived the run was deleted anyway.
 *
 * Detected by the parent side of the join, which separates the two shapes
 * cleanly. Pieces of one composite key point at different parent columns
 * (`id` and `search_id`); two genuinely separate foreign keys to the same
 * table point at the same one (`message.sender_id` and
 * `message.recipient_id` both -> `appuser.id`), and for those the traversal is
 * correct - it deletes the union, which is what deleting that parent means.
 */
export class CompositeKeyError extends Error {
  constructor(public readonly table: string) {
    super(
      `Cannot delete through "${table}": it is linked by a foreign key made of more than one column, ` +
        `and deleting on one column at a time would also remove rows belonging to other records.`,
    );
    this.name = 'CompositeKeyError';
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
  /**
   * Whether this walk is planning a delete. Turns on the checks that only
   * matter when the result will be used to remove rows: the composite-key
   * refusal below, and `forbidden` above. Counting stays permissive - it
   * reads, so the worst it can do is report a number that is larger than it
   * should be, which is exactly what a composite key makes it do.
   */
  forDelete?: boolean;
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

    if (options.forDelete) {
      // One composite key arrives here as several single-column relations to
      // the same table. Refuse before anything is generated - see
      // CompositeKeyError.
      const parentColumnsByTable = new Map<string, Set<string>>();
      for (const child of expressions) {
        const key = tableKey(child.table);
        const seen = parentColumnsByTable.get(key) ?? new Set<string>();
        seen.add(child.relatedColumn ?? '');
        parentColumnsByTable.set(key, seen);
      }
      for (const [childTable, parentColumns] of Array.from(parentColumnsByTable)) {
        if (parentColumns.size > 1) throw new CompositeKeyError(childTable);
      }
    }

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
 * The column the root's own DELETE keys on.
 *
 * Hardcoded, carried forward from the routine this replaces, where the same
 * limitation lived as a FIXME: a table whose primary key is not `id` still
 * cannot be deleted through. It does not affect counting, which never uses it.
 */
const ROOT_COLUMN = 'id';

/**
 * The real name of the table the root expression sits on.
 *
 * Needs two builds, and the reason is a quirk worth stating: `selected-tables`
 * deliberately omits the pipe's *final* table (pipeline.md), so a single-table
 * expression like `company` reports no tables at all and there is nothing to
 * look the current alias up in. Adding a trailing pipe makes that table no
 * longer final, so the second build does list it -- and the first build is
 * what says which alias to look for.
 *
 * The obvious shortcut, deriving the name from the alias, does not work:
 * pine builds `c_0` from `company`, and stripping the suffix gives `c`.
 */
const rootTableOf = async (
  client: HttpClient,
  expression: string,
  connectionId?: string,
): Promise<{ table: string; schema: string | null; column: string }> => {
  const alias = (await client.build([expression], undefined, connectionId))?.ast?.current;
  const probe = await client.build([`${expression} |`], undefined, connectionId);
  const match = probe?.ast?.['selected-tables']?.find(t => t.alias === alias);
  return {
    // The alias is a poor label, but it is honest -- better than a guess that
    // looks like a table name and is not one.
    table: match?.table ?? alias ?? 'table',
    schema: match?.schema ?? null,
    column: ROOT_COLUMN,
  };
};

// ---------------------------------------------------------------------------
// The verbs
// ---------------------------------------------------------------------------

/** One node's outcome once the script has actually been run. */
export type DeleteOutcome = { table: string; deleted: number } | { table: string; error: string };

/**
 * Where a delete run got to, so it can pick up from there.
 *
 * `from` is the index into the node list that the next attempt starts at: one
 * past the last node that succeeded. A failure leaves everything below it
 * already deleted, and children always go before parents -- so resuming at the
 * node that failed is both correct and the only sensible place to resume,
 * rather than starting over and re-issuing deletes that already ran.
 */
export type DeleteProgress = { from: number };

/**
 * Runs a planned delete, one node at a time, in the order the nodes are in.
 *
 * Not by sending the generated script to /api/v1/sql, which is the obvious
 * implementation and does not work: `run-sql` (pine-lang's db/exec.clj) picks
 * SELECT-vs-action by string prefix, takes the action branch for a script
 * starting with a comment, and hands the whole thing to `jdbc/execute!` --
 * which prepares a statement, and PgJDBC refuses more than one command in a
 * prepared statement. Its return shape assumes a single count too. The script
 * fails outright rather than running non-atomically.
 *
 * So each node's own Pine goes down the ordinary eval path instead, as
 * `<expr> | limit: N | delete! .<column>`. That keeps the whole thing inside
 * the AST layer rather than reaching for raw SQL, and it lets the panel report
 * each table as it goes.
 *
 * The cost, which the caller must state rather than imply: **there is no
 * transaction across nodes.** A failure partway leaves the deeper deletes
 * committed and the shallower ones not. For this shape that is an unfinished
 * job rather than a corrupt one -- the order is children before parents, so a
 * partial run never leaves a foreign key violated -- and re-running the
 * traversal re-counts and finishes it.
 */
export const runDeleteScript = async (
  client: HttpClient,
  nodes: TraversalNode[],
  connectionId?: string,
  onOutcome?: (outcome: DeleteOutcome) => void,
  // Where to start. Non-zero when resuming after a failure or a pause: the
  // nodes before it are already gone, and re-running their DELETEs would at
  // best be a no-op and at worst confusing to read in the outcome list.
  from = 0,
  signal?: { cancelled: boolean },
): Promise<DeleteOutcome[]> => {
  const outcomes: DeleteOutcome[] = [];
  for (const node of nodes.slice(from)) {
    if (signal?.cancelled) break;
    const expression = `${node.expression} | limit: ${node.count} | delete! .${node.column}`;
    let outcome: DeleteOutcome;
    try {
      const response = await client.eval([expression], connectionId);
      outcome = response?.error
        ? { table: node.table, error: response.error }
        : { table: node.table, deleted: Number(response?.result?.[1]?.[0] ?? 0) };
    } catch (e) {
      outcome = { table: node.table, error: e instanceof Error ? e.message : 'Failed' };
    }
    outcomes.push(outcome);
    onOutcome?.(outcome);
    // Stop at the first failure. Carrying on would try to delete a parent
    // whose child still has rows, which fails on the foreign key anyway --
    // and a wall of consequential errors buries the one that matters.
    if ('error' in outcome) break;
  }
  return outcomes;
};

/**
 * Breaks a Pine expression onto one line per operation, for the comment above
 * each DELETE.
 *
 * The walk assembles expressions by appending joins, so they arrive as one
 * long line. Read as a comment in a script -- next to a DELETE that is already
 * several lines of formatted SQL -- that is the hardest part to scan.
 *
 * A plain split rather than a round trip to pine-lang's prettify for each
 * node: the walk already costs several requests per table, and this text is a
 * *comment*. The one thing a naive split gets wrong is a pipe inside a string
 * literal (`where: name = 'a|b'`), and the cost of that here is a comment with
 * an odd line break in it -- nothing is parsed, and nothing runs differently.
 */
const asLines = (expression: string): string =>
  expression
    .split('|')
    .map(part => part.trim())
    .filter(Boolean)
    .join('\n | ');

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
    parts.push(`/*\n${asLines(node.expression)}\n*/`);
    parts.push(query);
  }
  parts.push('COMMIT;');
  // Comments pass through untouched; only the statements are formatted. Same
  // split the routine this replaces used, so the output is comparable.
  return parts.map(part => (part.trim().startsWith('/*') ? part : formatSql(part))).join('\n\n');
};
