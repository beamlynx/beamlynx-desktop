import { isPlayground } from './util';
import type { DbType } from '../utils/dbType';

// Inside beamlynx-desktop, the desktop app says where its bundled server
// listens. Its dev build uses a different port than the installed app, so
// both can run at once.
//
// Everywhere else: note the static export loaded via file:// has
// window.location.hostname '', so isPlayground() returns false there too.
// Don't "fix" the empty-hostname case without checking this.
const getBaseUrl = () => {
  const desktopUrl = typeof window !== 'undefined' ? window.beamlynxDesktop?.pineServerUrl : undefined;
  if (desktopUrl) return desktopUrl;
  return isPlayground() ? 'https://api.playground.beamlynx.com' : 'http://localhost:33333';
};

export type Table = { schema: string; table: string; alias: string };
export type TableHint = {
  // null identifies a hint that refers to a variable/checkpoint rather than a
  // real table - see pine-lang's create-hint-from-table/relation-hints, which
  // only null the schema for a variable name match.
  schema: string | null;
  table: string;
  // This table's own join column. 'related-column' is the already-selected
  // context table's own join column - together they're both ends of the edge
  // this hint describes (see create-hint-from-relation-array in pine-lang).
  // Both are entirely absent (not even null) on a no-context hint
  // (create-hint-from-table, the very first table in a pipeline) - there's no
  // relation at all yet to describe.
  column?: string;
  'related-column'?: string;
  // Every column pair of the relation, present only when there is more than
  // one - i.e. a foreign key made of several columns. `column`/
  // `related-column` above are the first of these, the pair the hint's `pine`
  // text names; joining needs no more than that, since naming any column of a
  // key joins on the whole key. Something that has to name the whole key
  // rather than join on it - scoping a `delete!` to the rows this relation
  // reaches - needs them all. pine-lang leaves it off a single-column key,
  // where it would only repeat the two fields above across what can be
  // thousands of hints, so read it as `columns ?? [{column, related-column}]`.
  columns?: { column: string; 'related-column': string }[];
  parent?: boolean;
  // 'synthetic' is a made-up id=id join with no real FK behind it (today only
  // ever the same-source case - see docs/named-results.md in pine-lang - but not
  // inherently variable-specific; a future self-join between two real tables
  // would use the same tag). 'manual' (explicit `.col1 = .col2`) is never
  // emitted by hints today - that syntax bypasses the reference map entirely,
  // so there's nothing to suggest - but it's reserved here for
  // forward-completeness.
  resolution?: 'fk' | 'heuristic' | 'synthetic' | 'manual';
  pine: string;
};

export type ColumnHint = {
  column: string;
  alias: string;
};

export type CursorPosition = {
  line: number; // 0-indexed line number
  character: number; // 0-indexed character offset within line
};

/**
 * One discovered join chain from wherever a `? table` expression's pipe left
 * off to the named table - pine-lang's `? table` operation (docs/paths.md),
 * not just the direct next hop. Each entry in `hops` has exactly the shape a
 * `TableHint` does (a path is a subset of that, not a new shape) - `pine` is
 * just those hops' own `pine` fields joined the same way typing them by hand
 * would: piped, in order. `length` is `hops.length`, given separately so the
 * UI can show/sort on it without re-deriving it.
 */
export type PathHint = {
  pine: string;
  length: number;
  hops: TableHint[];
};

export type Hints = {
  table: TableHint[];
  select: ColumnHint[];
  order: ColumnHint[];
  where: ColumnHint[];
  update: ColumnHint[];
  // Populated only once a `? table` operation's target names a real table -
  // see pine-lang's generate-path-hints. Empty (not absent) otherwise, same
  // convention as every other hint bucket.
  paths: PathHint[];
  // The JSON columns `unnest:` can read. Absent from a server older than it.
  unnest?: ColumnHint[];
  context: string;
};
// There are more operations. I'll add them as we need to handle them here
export type OperationType =
  | 'table'
  | 'select'
  | 'select-partial'
  | 'order'
  | 'order-partial'
  | 'where'
  | 'where-partial'
  | 'update-action'
  | 'update-partial'
  | 'paths';
export type Operation = {
  type: OperationType;
  // Shape varies by operation type (e.g. `{schema, table, alias?}` for
  // 'table', a column array for 'select-partial', ...) - only the 'table'
  // shape is currently consumed (canvas mode's still-being-typed node; see
  // layout.ts), so this is intentionally loose rather than a full union.
  value?: unknown;
};
/** One step of a path into a JSON column: a key, or an array index. */
export type JsonPathStep = string | number;

/**
 * A column as Pine writes it: `data`, or `data.address.city` for a key inside
 * a JSON column. Keys that aren't Pine names are quoted, `data.'home address'`,
 * and indexes are bracketed, `data.tags[0]`. Mirrors pine-lang's
 * pine.ast.path/path-text, which names a path column the same way.
 */
export const columnName = (column: string, path?: JsonPathStep[] | null): string =>
  (path ?? []).reduce<string>(
    (name, step) =>
      typeof step === 'number'
        ? `${name}[${step}]`
        : /^[A-Za-z_][A-Za-z0-9_-]*$/.test(step)
          ? `${name}.${step}`
          : `${name}.'${step.replace(/'/g, "''")}'`,
    column,
  );

/** One condition of a `where:`, as pine-lang reports it in `ast.where`. */
export type WhereCondition = {
  alias: string;
  column: string;
  // Set when the condition is on a key inside a JSON column.
  path?: JsonPathStep[];
  cast: string | null;
  // SQL-cased, e.g. "ILIKE".
  operator: string;
  // A literal compared with a JSON key arrives as JSON text, with its
  // 'json-type': `'SE'` is `"SE"`. See whereLiteral.
  // After `in (1, 2)`, a list of them.
  value: WhereValue | WhereValue[] | null;
};

type WhereValue = { type: string; value: string; 'json-type'?: string };

/**
 * A condition's value as Pine shows it: a $variable as `$name`, and a
 * literal pine-lang turned into JSON for a JSON key decoded back, so
 * `data.country = 'SE'` reads `SE`, not `"SE"`.
 */
export const whereLiteral = (value: WhereCondition['value']): string => {
  if (Array.isArray(value)) return `(${value.map(v => whereLiteral(v)).join(', ')})`;
  if (!value || !('value' in value)) return '';
  if (value.type === 'variable') return `$${value.value}`;
  if (value['json-type']) {
    try {
      return String(JSON.parse(value.value));
    } catch {
      return value.value;
    }
  }
  return `${value.value}`;
};

/**
 * One entry of `ast.where`. Entries are ANDed. An `or` group is the
 * conditions of one `where:` joined with `or` (`where: a = 1 or b = 2`).
 */
export type WhereEntry = WhereCondition | { or: WhereCondition[] };

/** The conditions of one `ast.where` entry: one, or every member of an `or` group. */
export const whereConditions = (entry: WhereEntry): WhereCondition[] =>
  'or' in entry ? entry.or : [entry];

/** One column pair of a join's ON clause, each side labelled by the alias that owns it. */
export type JoinColumns = { from: string; to: string };

/**
 * One join in the pipeline, as pine-lang describes it.
 *
 * `from`/`to` are the two aliases in pipeline order - the order they were
 * typed. `columns` is every column pair of the ON clause, so a foreign key
 * made of more than one column is simply a longer list; read it as a list,
 * never as `columns[0]`. `parent` says which of the two sides owns the key
 * being pointed at. `resolution` is the same confidence tag a `TableHint`
 * carries (see `TableHint.resolution`), so an already-committed join doesn't
 * need a client-side workaround - re-deriving it from the picker hint that
 * produced it - to know whether it's backed by a real FK.
 *
 * `resolution: null` is an unresolved join: nothing connects the two tables,
 * or an explicit join-column matched no real reference (e.g. a canvas edit
 * retargeted this join onto a different upstream table after the one in
 * between was deleted). `columns` is empty in that case and the SQL has no ON
 * clause. There is exactly one spelling for it, so checking `resolution` is
 * enough - see layout.ts's addJoins.
 *
 * `cast` is `'text'` when a heuristic join's two sides have different DB types
 * (unused here - only pine-lang's own SQL generation reads it).
 */
export type Join = {
  from: string;
  to: string;
  columns: JoinColumns[];
  parent: 'from' | 'to';
  resolution: TableHint['resolution'] | null;
  /** `'LEFT'`/`'RIGHT'`, or null for an inner join. */
  type: string | null;
  cast: string | null;
};

export type Column = {
  alias: string;
  column: string;
  'column-alias': string;
  hidden: boolean;
  // A primary key column pine-lang added so a row can be edited. One per key
  // column of each table; a table without a primary key has none.
  'auto-id'?: boolean;
  // A key inside a JSON column. Computed by the query, so it can't be edited.
  path?: JsonPathStep[];
  // A date bucket, `created_at => month`. Computed too.
  'col-fn'?: string;
  // A hidden column holding the JSON type of a path column's value in each
  // row, named after that column's 'column-alias'.
  'json-type-of'?: string;
  // A hidden column holding each row's position of an unnested element in
  // its array, for the elements named by 'alias'.
  'element-index'?: boolean;
  // How the access policy treats this column. Only when a policy was sent.
  policy?: ColumnPolicy;
};

/** Range returned by the build endpoint mapping segments to table aliases */
export type PineRange = {
  alias: string;
  start: { line: number; character: number };
  end: { line: number; character: number };
};

/** A named result (`|= name`) as /build's AST describes it. */
export type NamedResultAst = {
  'selected-tables': Table[];
  tables?: Table[];
  joins: Join[];
  columns: Column[];
  // The stage's own filters, for a checkpoint's snapshot - the canvas shows
  // them as chips on the tables the checkpoint sealed. Absent from a server
  // older than ast.checkpoints.
  where?: WhereEntry[];
  order?: OrderColumn[];
  group?: GroupColumn[];
};

/** A column a checkpoint names: one after `per`, or one it groups by. */
export type CheckpointColumn = { alias: string; column: string; path?: JsonPathStep[]; 'column-alias'?: string };

/**
 * One checkpoint - a group:/limit: whose result is sealed into a CTE - as
 * pine-lang's /build reports it in `ast.checkpoints`, in pipe order. See
 * pine-lang's docs/checkpoints.md ("What /build reports").
 */
export type Checkpoint = {
  /** The CTE's name: the `|= name`, or the auto name (`result_1`, ...). Shown as is. */
  name: string;
  /** false only for a checkpoint still pending at the end of the expression; `name` is the one sealing it gives it. */
  sealed: boolean;
  /** The operation index of its group:/limit: step - the same index as `ast.ranges`. */
  index: number;
  kind: 'limit' | 'group';
  limit?: number;
  per?: CheckpointColumn[];
  group?: CheckpointColumn[];
  aggregates?: string[];
  /** The aliases of the tables it seals, in pipe order. A later checkpoint lists the earlier one's name. */
  tables: string[];
  /** The names of the columns its result has. */
  columns: string[];
};

/** An order-by entry - distinct from Column: no `column-alias`/`hidden`, but carries direction. */
export type OrderColumn = {
  alias: string;
  column: string;
  path?: JsonPathStep[];
  direction: 'ASC' | 'DESC';
  // Where NULLs go, when the order: item says: `nulls first`.
  nulls?: 'FIRST' | 'LAST';
  'operation-index'?: number;
};

/** A group-by entry (pine-lang's ast/group.clj) - alias/column only, no aggregation info canvas mode needs. */
export type GroupColumn = { alias: string; column: string; path?: JsonPathStep[]; 'operation-index'?: number };

export type Ast = {
  hints: Hints;
  'selected-tables': Table[];
  joins: Join[];
  context: string;
  current: string;
  operation: Operation;
  columns: Column[];
  // Wire shape is actually OrderColumn (below), not Column - no `column-alias`/`hidden`,
  // but carries `direction`. Left as Column[] here since store/graph.util.ts's
  // makeColumnsLookup(orderColumns: Column[]) only ever reads `.alias`/`.column`
  // and is out of scope to touch; canvas mode casts to OrderColumn[] where it needs `direction`.
  order: Column[];
  where: WhereEntry[];
  group?: GroupColumn[];
  prettified: string;
  ranges: PineRange[];
  'named-results'?: Record<string, NamedResultAst>;
  'pending-assignments'?: Record<string, NamedResultAst>;
  assign?: string;
  // Absent from a server older than this field.
  checkpoints?: Checkpoint[];
  // Every `unnest:`, in pipe order. Absent from a server older than it.
  unnests?: Unnest[];
};

/**
 * One `unnest: data as e` step, as pine-lang's /build reports it in
 * `ast.unnests`. It isn't a table: its elements are read by its alias, and
 * the canvas shows it on the node of the table whose column holds the
 * array. See pine-lang's docs/json-paths.md ("Arrays as rows").
 */
export type Unnest = {
  /** The name the elements are read by: `e`. Columns, conditions and order items on them carry it as their alias. */
  alias: string;
  /** The alias of the table whose column holds the array. */
  table: string;
  /** The array's path from that table: `data.changes`, or `o.items` for the elements of the elements `o`. */
  text: string;
  /** Its operation index, the same index as `ast.ranges`. */
  index: number;
  /**
   * Where the array is: a column of the table `source` and the keys inside it,
   * or (column null) the keys inside the elements `source`. With each row's
   * positions, the grid turns `e.qty` into `data.items[1].qty` to edit it.
   */
  source?: string;
  column?: string | null;
  path?: JsonPathStep[];
};

// A $variable's value as pine-lang takes it: a string, number or boolean, or a
// list of them for `in $name`. See pine-lang's docs/variables.md.
export type VariableScalar = string | number | boolean;
export type VariableValue = VariableScalar | VariableScalar[];

// What /build reports about an expression's $variables: every one used, those
// with no value, those used with `in` (which take a list), and the values
// written in the tab's values blocks.
export type VariablesReport = {
  used: string[];
  unbound: string[];
  lists: string[];
  values?: Record<string, VariableValue>;
};

export type Response = {
  'connection-id': string;
  version: string;
  error: string;
  'error-type': string;
  // A refusal for a hidden column (error-type "policy") names it: the
  // column, its real table, and the rule that hid it, if any. Absent from a
  // pine-lang older than in-call approvals.
  'hidden-column'?: ColumnPolicy & { alias?: string; column: string };
  // build
  ast: Ast;
  query: string;
  // The same SQL without the hidden columns pine-lang adds for the results
  // grid. Absent from a server older than JSON key edits.
  'query-without-hidden'?: string;
  // Absent against a server older than $variables.
  variables?: VariablesReport;
  // eval refused for a missing value: the names of the variables without one.
  unbound?: string[];
  // This tab's doc comment: the comment at the top of the *first* expression
  // sent, cleaned for display (delimiters, per-line markers and shared
  // indentation removed). Null/absent when there isn't one, and absent
  // entirely against a server older than the feature. See pine-lang's
  // docs/comments.md.
  doc?: string | null;
  // eval
  result: (string | number)[][];
  columns: Column[];
  // Whether the expression changes data -- true for delete!/update! (and d!/u!),
  // false for everything else. Present on every eval response, including one
  // refused because the caller sent allow-writes: false, which comes back with
  // `error-type: "write-refused"`. Absent against a server older than the
  // feature. See pine-lang's docs/side-effects.md.
  writes?: boolean;
  // Nicely formatted rendering of the expression that ran - pine-lang
  // computes it on every build or eval alike (see client.prettify()'s own
  // use of ast.prettified for build), so it comes back here for free
  // instead of needing a second /api/v1/build round trip.
  prettified: string;
};

export type ConnectionStatsResponse = {
  connectionCount: number;
  time: Date;
};

// Mirrors pine-lang's pine.access-policy rule shape (its
// docs/access-policy.md) and beamlynx-desktop's credential-store.ts
// AccessPolicyRule 1:1 -- sent verbatim (minus `id`, `enabled` and
// `builtIn`, see AccessPolicyModule below) as the `access-policy` param
// below. See access_policy.clj's docstring for why pine-lang itself
// carries no default of this.
//
// A matcher names some columns. On its own it is a show rule; wrapped in a
// `hide` rule it hides them, whatever any show rule says.
export type ColumnMatcher =
  | { type: 'column-type'; allow: string[] }
  | { type: 'foreign-key' }
  | { type: 'column-name'; suffix?: string; contains?: string; equals?: string }
  | { type: 'column'; schema?: string | null; table: string; column: string };

export type AccessPolicyRule = ColumnMatcher | { type: 'hide'; match: ColumnMatcher };

// One rule of a named policy -- see AccessPolicy below: the rule, an id,
// and whether it's currently on. A built-in rule can be switched off but
// not removed. effectiveAccessPolicyRules strips all three before this ever
// reaches pine-lang, which only ever sees rules that are already active.
export type AccessPolicyModule = AccessPolicyRule & { id: string; enabled: boolean; builtIn?: boolean };

// How pine-lang treated one result column, when a policy was sent (see its
// docs/access-policy.md): hidden or not, the rule that decided, and the
// column's real table, which a `column` rule names. A computed value has
// `hidden` only.
export type ColumnPolicy = {
  hidden: boolean;
  by?: AccessPolicyRule;
  table?: { schema: string | null; table: string };
};

// The policy a request carries. `enforce` masks what the rules hide.
// `annotate` masks nothing and only reports each column's ColumnPolicy, so
// the owner's own tab can mark what an agent can't see. Decided in one
// place, effectiveAccessPolicy below, which never returns `annotate` for an
// agent's query.
export type AppliedAccessPolicy = { rules: AccessPolicyRule[]; mode: 'enforce' | 'annotate' };

// A named set of rule modules: a connection's own policy, which it points
// at by ConnectionInfo.policyId below and shares with no other connection,
// or a template (Settings -> Policy templates), copied into a connection
// when attached. See GlobalStore.accessPolicies.
export type AccessPolicy = {
  id: string;
  name: string;
  rules: AccessPolicyModule[];
  // The built-in Default template: kept in the desktop app, read-only.
  builtIn?: boolean;
  // The connection this policy belongs to. None on a template.
  connectionId?: string;
  // The template a connection's policy was copied from.
  template?: { id: string; name: string };
};

export type ConnectionInfo = {
  id: string;
  label: string;
  // Only present in desktop mode, where entries come from locally saved
  // profiles rather than pine-server's live session list -- carried here so
  // GlobalStore.deleteConnection can derive pine's own connection id
  // (`${dbHost}:${dbPort}:${dbName}`) without an extra round trip.
  dbHost?: string;
  dbPort?: string;
  dbName?: string;
  // Desktop-only: whether this saved connection has been opted in to MCP
  // access. See GlobalStore.setMcpEnabled and
  // beamlynx-plans/completed/2026-08-15-mcp-server-and-url-scheme.md.
  mcpEnabled?: boolean;
  // Desktop-only: which access policy (if any) applies to this connection,
  // defaulted at connection creation (credential-store.ts's saveConnection)
  // to whichever policy exists first. Applies from any tab, not just
  // MCP-driven ones -- see Session.accessPolicyRules. null means "None" --
  // no policy selected, whether that's a fresh connection nobody has
  // decided on yet, or a deliberate choice of unrestricted access (e.g. a
  // local/sandbox DB) -- or the policy it used to point at was deleted. MCP
  // can be enabled while this is null (unrestricted, on purpose) or while
  // it resolves to a policy with an active rule -- see
  // effectiveAccessPolicyRules below.
  policyId?: string | null;
  // Desktop-only: whether the connection owner has switched the assigned
  // policy ON for their own (non-MCP) queries on this connection too -- MCP
  // always uses the assigned policy regardless of this. Defaults to false:
  // the owner's own tabs see real data on this connection unless they opt
  // in. Undefined (older saved connections) also means false. See
  // effectiveAccessPolicyRules below.
  applyPolicyToOwnQueries?: boolean;
  // Desktop-only: agent access set to "Every column". Agents see every
  // column, unmasked, and the policy stays, unapplied, for when access goes
  // back to "Masked". Undefined (an older desktop app) means false.
  agentsSeeEveryColumn?: boolean;
};

/** What agents can do on a connection: the three values of its Agent access. */
export type AgentAccess = 'off' | 'masked' | 'every-column';

export function agentAccessOf(connection: ConnectionInfo | undefined): AgentAccess {
  if (!connection?.mcpEnabled) return 'off';
  return !connection.policyId || connection.agentsSeeEveryColumn ? 'every-column' : 'masked';
}

// The single place that decides which rules actually apply for a
// connection right now -- shared by Session.accessPolicyRules (session.ts,
// human tabs and the dedicated MCP tab alike) and GlobalStore's
// mcpQueryDeps (explainMcpQuery, which has no Session to read this from).
//
// `forMcp` is the one thing that can differ between the two callers:
// - MCP (forMcp: true) always uses the connection's assigned policy the
//   moment mcpEnabled is true -- credential-store.ts's setMcpEnabled
//   refuses turning mcpEnabled on unless policyId is null ("None",
//   deliberately unrestricted) or already resolves to a policy with an
//   active rule, so there is no undecided "MCP on, no policy" state to
//   handle here, only the deliberate one (which the `!connection?.policyId`
//   check below already returns [] for). applyPolicyToOwnQueries is never
//   consulted for this caller: it governs the human's own tabs only, never
//   what the agent sees.
// - A human's own tab (forMcp: false) never applies the assigned policy
//   unless applyPolicyToOwnQueries is explicitly true -- the access policy
//   exists to gate the MCP agent, not the connection's own owner, so an
//   owner's own queries see real data by default regardless of mcpEnabled.
//   Independent of mcpEnabled either way, so turning MCP on doesn't also
//   redact the human's own browsing on that connection.
export function effectiveAccessPolicyRules(
  connection: ConnectionInfo | undefined,
  policies: AccessPolicy[],
  forMcp: boolean,
): AccessPolicyRule[] {
  if (!connection?.policyId) return [];
  // Every column: the policy is kept but applies to no one. Masking your
  // own queries shows what agents see, which is then everything.
  if (connection.agentsSeeEveryColumn) return [];
  if (forMcp ? !connection.mcpEnabled : connection.applyPolicyToOwnQueries !== true) return [];
  const policy = policies.find(p => p.id === connection.policyId);
  if (!policy) {
    // An agent's query on a connection whose policy can't be found would
    // otherwise run with no rules at all: every column shown. Refuse it.
    // Nothing is hidden from the owner's own tab that wasn't before.
    if (forMcp) {
      throw new Error(
        "Refusing to run an agent's query: this connection's masking policy wasn't found. Open Settings to check it.",
      );
    }
    return [];
  }
  return activeRules(policy);
}

function activeRules(policy: AccessPolicy): AccessPolicyRule[] {
  return policy.rules
    .filter(m => m.enabled)
    .map(({ id: _id, enabled: _enabled, builtIn: _builtIn, ...rule }) => rule as AccessPolicyRule);
}

// What a request from this tab carries: the rules effectiveAccessPolicyRules
// enforces, if any. Otherwise, on a human tab of a connection agents can
// query, its policy to annotate with, so the tab can show which columns an
// agent can't see without hiding them from the owner. An agent's query
// (forMcp) is always `enforce`.
export function effectiveAccessPolicy(
  connection: ConnectionInfo | undefined,
  policies: AccessPolicy[],
  forMcp: boolean,
): AppliedAccessPolicy {
  const rules = effectiveAccessPolicyRules(connection, policies, forMcp);
  if (rules.length || forMcp || !connection?.mcpEnabled || !connection.policyId || connection.agentsSeeEveryColumn) {
    return { rules, mode: 'enforce' };
  }
  const policy = policies.find(p => p.id === connection.policyId);
  return policy ? { rules: activeRules(policy), mode: 'annotate' } : { rules: [], mode: 'enforce' };
}

// The request body's policy fields. Nothing at all without rules, so a
// request without a policy is the one it always was.
function policyParams(policy?: AppliedAccessPolicy): {
  'access-policy'?: AccessPolicyRule[];
  'access-policy-mode'?: 'annotate';
} {
  if (!policy?.rules.length) return {};
  return policy.mode === 'annotate'
    ? { 'access-policy': policy.rules, 'access-policy-mode': 'annotate' }
    : { 'access-policy': policy.rules };
}

export type ConnectionsListResult = {
  version: string;
  'selected-connection-id': string | null;
  connections: ConnectionInfo[];
};

/**
 * Puts every operation of an expression at the start of its own line.
 *
 * Only ever rewrites the whitespace in front of a leading `|`, never anything
 * between pipes -- so, unlike splitting on `|`, it cannot damage a string
 * literal that happens to contain one (`where: name = 'a|b'`). pine-lang's own
 * prettify indents its continuation lines by a space; a traversal's expressions
 * are assembled here rather than there, and this keeps the whole expression in
 * one style rather than the first half in pine's and the appended half in ours.
 */
export const pipesAtLineStart = (expression: string): string =>
  expression
    .split('\n')
    .map((line, i) => (i === 0 ? line : line.replace(/^[ \t]+\|/, '|')))
    .join('\n');

/**
 * The `delete!` operation scoping a delete to the given columns.
 *
 * More than one when the rows are identified by a foreign key made of several
 * columns. pine-lang matches those as a row -- `WHERE (a, b) IN ( SELECT a, b
 * ... )` -- which is the only correct thing to do: one column of such a key
 * matches rows belonging to other records too, and says nothing about it.
 */
export const deleteOp = (columns: string[]): string =>
  `delete! ${columns.map(c => `.${c}`).join(', ')}`;

/**
 * The server answered 401: it requires a launch token this app didn't send.
 * beamlynx-desktop gives its bundled server a fresh token each launch and
 * hands the same token to this UI (authHeaders below), so this means the UI
 * and the server came from different launches, or the UI is too old for the
 * server.
 */
/**
 * Connecting failed. errorType is pine-lang's `error-type`, like
 * "database-unreachable" when the database didn't answer.
 */
export class ConnectionError extends Error {
  constructor(
    message: string,
    readonly errorType?: string,
  ) {
    super(message);
    this.name = 'ConnectionError';
  }
}

export class ServerRejectedError extends Error {
  constructor() {
    super("The Pine server refused this app's requests: it requires a launch token this app didn't send. Restart beamlynx.");
    this.name = 'ServerRejectedError';
  }
}

// The desktop app's launch token for its bundled server, when there is one.
// Every request carries it; the server refuses requests without it, so no
// other program or web page can use the server.
export const authHeaders = (): Record<string, string> => {
  const token = typeof window !== 'undefined' ? window.beamlynxDesktop?.pineServerToken : undefined;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** pine-lang's POST /api/v1/sql-to-pine. */
export type SqlSchemaResponse = {
  dialect?: 'postgres' | 'mysql' | 'sqlite';
  'default-schema'?: string;
  tables: { schema: string; table: string; columns: string[] }[];
};

/** A join to suggest after JOIN in the SQL panel (pine-lang's /sql-join-hints). */
export type SqlJoinHint = {
  /** The text that goes after JOIN: `employee e ON e.company_id = c.id`. */
  sql: string;
  schema: string | null;
  table: string;
  /** fk for a foreign key, heuristic for a join guessed from column names. */
  resolution: string;
};

export type SqlToPineResponse = {
  expression?: string;
  warnings?: string[];
  error?: string;
  /** sql-unsupported, sql-parse-error or internal. */
  'error-type'?: string;
};

export class HttpClient {
  constructor(private readonly onBuild?: (ast: Ast) => void) {}

  private async baseGet<T>(path: string): Promise<T | undefined> {
    const res = await fetch(`${getBaseUrl()}/api/v1/${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
    });
    if (res.status === 401) {
      throw new ServerRejectedError();
    }
    if (!res.ok) {
      return;
    }
    return await res.json();
  }

  public async get(path: string): Promise<Response | undefined> {
    return this.baseGet<Response>(path);
  }

  public async getConnectionStats(): Promise<ConnectionStatsResponse | undefined> {
    const res = await this.baseGet<{ 'connection-count': number; time: string }>(
      'connection/stats',
    );
    // No numbers when nothing is selected (pine-lang answers with an error).
    if (!res || typeof res['connection-count'] !== 'number') {
      return;
    }
    return {
      connectionCount: res['connection-count'],
      time: new Date(res.time),
    };
  }

  public async listConnections(): Promise<ConnectionsListResult | undefined> {
    const res = await this.baseGet<{ result: ConnectionsListResult }>('connections');
    return res?.result;
  }

  // A non-2xx response here is usually an uncaught exception on the server
  // (e.g. an unreachable DB during connection setup), not the app's normal
  // `{ error: "..." }` JSON shape - so its body may not even be JSON. Try to
  // pull a real message out of it before falling back to the HTTP status,
  // rather than discarding it and forcing every caller to show a generic
  // "no response" message.
  private async describeFailure(res: globalThis.Response): Promise<string> {
    try {
      const body = await res.json();
      if (body && typeof body.error === 'string' && body.error) {
        return body.error;
      }
    } catch {
      // Not JSON (e.g. a raw stack trace from an unhandled exception).
    }
    return `${res.status} ${res.statusText || 'Request failed'}`;
  }

  private async post(path: string, body: object): Promise<Response | undefined> {
    const res = await fetch(`${getBaseUrl()}/api/v1/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      throw new ServerRejectedError();
    }
    if (!res.ok) {
      throw new Error(await this.describeFailure(res));
    }
    return await res.json();
  }

  private async del(path: string): Promise<Response | undefined> {
    const res = await fetch(`${getBaseUrl()}/api/v1/${path}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
    });
    if (res.status === 401) {
      throw new ServerRejectedError();
    }
    if (!res.ok) {
      throw new Error(await this.describeFailure(res));
    }
    return await res.json();
  }

  private withConnectionId(body: object, connectionId?: string): object {
    if (connectionId) {
      return { ...body, 'connection-id': connectionId };
    }
    return body;
  }

  /**
   * The connection's tables and columns, for completing SQL in the SQL panel
   * (pine-lang's docs/sql-hints.md). Empty with no connection.
   */
  public async sqlSchema(connectionId?: string): Promise<SqlSchemaResponse> {
    const response = await this.post('sql-schema', this.withConnectionId({}, connectionId));
    return (response ?? { tables: [] }) as unknown as SqlSchemaResponse;
  }

  /**
   * After JOIN in the SQL being typed, the tables that join to the query's
   * (pine-lang's docs/sql-hints.md). `cursor` is an offset into `query`.
   */
  public async sqlJoinHints(query: string, cursor: number, connectionId?: string): Promise<SqlJoinHint[]> {
    const response = await this.post('sql-join-hints', this.withConnectionId({ query, cursor }, connectionId));
    return ((response as unknown as { joins?: SqlJoinHint[] })?.joins ?? []) as SqlJoinHint[];
  }

  /**
   * One SQL SELECT as Pine (pine-lang's docs/sql-to-pine.md). Nothing runs.
   * Never called from store/mcp-query.ts: agents write Pine, and no SQL
   * reaches pine-lang from the MCP surface (see the no-raw-SQL test).
   */
  public async sqlToPine(query: string, connectionId?: string): Promise<SqlToPineResponse> {
    const response = await this.post('sql-to-pine', this.withConnectionId({ query }, connectionId));
    return (response ?? {}) as unknown as SqlToPineResponse;
  }

  public async prettify(expression: string, connectionId?: string): Promise<string> {
    const response: Response | undefined = await this.post(
      'build',
      this.withConnectionId({ expressions: [expression] }, connectionId),
    );
    if (!response) {
      throw new Error('No response when trying to prettify');
    }
    if (response.error || !response.ast?.prettified) {
      return expression;
    }
    return response.ast.prettified;
  }

  public async eval(
    expressions: string[],
    connectionId?: string,
    accessPolicy?: AppliedAccessPolicy,
    // false asks pine-lang to refuse an expression that changes data
    // (delete!/update!, and their d!/u! short forms) rather than run it -- see
    // its docs/side-effects.md. Sent only when explicitly false, so an
    // ordinary call is byte-for-byte the request it was before; pine-lang
    // treats the field's absence as "writes allowed", which is what the
    // person's own editor needs.
    allowWrites?: boolean,
    // Values for the expressions' $variables. Sent only when there are some,
    // so an expression without variables is the request it always was.
    variables?: Record<string, VariableValue>,
    // Names this run, so cancel() can stop it. A run without one can't be
    // stopped.
    runId?: string,
  ): Promise<Response> {
    const body: {
      expressions: string[];
      'access-policy'?: AccessPolicyRule[];
      'access-policy-mode'?: 'annotate';
      'allow-writes'?: boolean;
      variables?: Record<string, { value: VariableValue }>;
      'run-id'?: string;
    } = { expressions, ...policyParams(accessPolicy) };
    if (runId) {
      body['run-id'] = runId;
    }
    if (variables && Object.keys(variables).length) {
      body.variables = Object.fromEntries(Object.entries(variables).map(([name, value]) => [name, { value }]));
    }
    if (allowWrites === false) {
      body['allow-writes'] = false;
    }
    const response = await this.post('eval', this.withConnectionId(body, connectionId));
    if (!response) {
      throw new Error('No response when trying to eval');
    }
    return response;
  }

  public async sql(query: string, connectionId?: string, runId?: string): Promise<Response> {
    const response = await this.post(
      'sql',
      this.withConnectionId({ query: query.trim(), ...(runId ? { 'run-id': runId } : {}) }, connectionId),
    );
    if (!response) {
      throw new Error('No response when trying to execute SQL');
    }
    return response;
  }

  /**
   * Stops the run started with this id. The database stops the statement,
   * and the run answers with error-type "cancelled". A write is rolled back.
   */
  public async cancel(runId: string): Promise<void> {
    await this.post('cancel', { 'run-id': runId });
  }

  public async build(
    expressions: string[],
    cursor?: CursorPosition,
    connectionId?: string,
    accessPolicy?: AppliedAccessPolicy,
  ): Promise<Response> {
    const body: {
      expressions: string[];
      cursor?: CursorPosition;
      'access-policy'?: AccessPolicyRule[];
      'access-policy-mode'?: 'annotate';
    } = {
      expressions,
      ...policyParams(accessPolicy),
    };
    if (cursor) {
      body.cursor = cursor;
    }
    const response = await this.post('build', this.withConnectionId(body, connectionId));
    if (!response) {
      throw new Error('No response when trying to build');
    }
    this.onBuild && (await this.onBuild(response.ast));
    return response;
  }

  public async count(expression: string, connectionId?: string): Promise<number> {
    const response = await this.eval([`${expression} | count:`], connectionId);
    if (!response) {
      throw new Error('No respnse when trying to count');
    }
    if (response.error) {
      throw new Error(response.error);
    }
    // A header with no row means nothing was counted.
    const count = Number(response.result?.[1]?.[0]);
    if (!Number.isFinite(count)) {
      throw new Error("Couldn't count the matching rows");
    }
    return count;
  }

  public async makeChildExpressions(
    expression: string,
    connectionId?: string,
  ): Promise<{
    expressions: {
      expression: string;
      columns: string[];
      table: string;
      schema: string | null;
    }[];
    ast: Ast;
  }> {
    // Add trailing `|` explicitly for child expressions
    const x = `${expression} |`;
    const response = await this.post(
      'build',
      this.withConnectionId({ expressions: [x] }, connectionId),
    );
    if (!response) {
      throw new Error('No response when trying to make child Expressions');
    }
    this.onBuild && (await this.onBuild(response.ast));
    const expressions = response.ast.hints.table
      // A synthetic-join hint's column is made up (always "id"), not a real
      // FK column on an actual table, so it can't be recursively deleted
      // through.
      .filter(
        (h): h is TableHint & { column: string } =>
          !h.parent &&
          h.resolution !== 'heuristic' &&
          h.resolution !== 'synthetic' &&
          h.column !== undefined,
      )
      // table/schema come along so a caller can name the table without
      // re-parsing `h.pine` -- store/canvas/traversal.ts keys its cycle check
      // on them, and labels each row of its panel with them.
      .map(h => ({
        // Each hop on its own line. The walk builds an expression by appending
        // joins, and appended inline they ran onto the end of whatever the
        // canvas had already formatted -- so a traversal five tables deep read
        // as one long line. Pine treats a newline as whitespace, so this costs
        // nothing but makes every expression the walk produces readable
        // wherever it surfaces: the panel's tooltip, the comment above each
        // generated DELETE, the log of a run, and the tab you get when you
        // open a row.
        expression: pipesAtLineStart(`${expression}\n| ${h.pine}`),
        // Every column on THIS side of the join, not just the first: a
        // foreign key made of several columns needs all of them to scope a
        // DELETE, and one of them alone removes rows belonging to other
        // records. A single-column key carries no `columns` array (see
        // TableHint), so fall back to the one column it does name.
        columns: h.columns ? h.columns.map(c => c.column) : [h.column],
        table: h.table,
        schema: h.schema,
      }));
    return { expressions, ast: response.ast };
  }

  public async buildDeleteQuery(
    expression: string,
    columns: string[],
    limit: number,
    connectionId?: string,
  ): Promise<string> {
    const x = `${expression}\n| limit: ${limit}\n| ${deleteOp(columns)}`;
    const response = await this.build([x], undefined, connectionId);
    if (!response) {
      throw new Error('No response when trying to build the delete query');
    }
    return response.query;
  }

  public async createConnection(connection: {
    dbHost: string;
    dbPort: string;
    dbName: string;
    dbUser: string;
    dbPassword: string;
    dbType?: DbType;
  }): Promise<string> {
    type ServerConnectionParams = {
      host: string;
      port: string;
      dbtype: string;
      dbname: string;
      user: string;
      password: string;
      schema: string | null;
    };

    const connectionParams: ServerConnectionParams = {
      host: connection.dbHost,
      port: connection.dbPort,
      // Defaults to postgres for every existing caller that doesn't pass
      // dbType (saved-profile reconnects, MCP's ensureConnection) -- none
      // of those round-trip a db type today, see beamlynx-desktop's
      // SavedConnectionMeta.
      dbtype: connection.dbType ?? 'postgres',
      dbname: connection.dbName,
      user: connection.dbUser,
      password: connection.dbPassword,
      schema: null, // We don't have this in the current params, so setting to null
    };
    const response = await this.post('connections', connectionParams);
    if (!response) {
      throw new Error('No response when trying to create connection');
    }
    if (response.error) {
      throw new ConnectionError(response.error, response['error-type']);
    }
    return response['connection-id'] as string;
  }

  public async useConnection(connectionId: string): Promise<{ id: string; version: string }> {
    // Encoded because the id now folds dbname in (host:port:dbname, see
    // pine.db.connections/make-connection-id) -- a dbname with a character
    // that's not path-safe would otherwise land as extra/malformed segments.
    const response = await this.post(`connections/${encodeURIComponent(connectionId)}/connect`, {});
    if (!response) {
      throw new Error('No response when trying to test connection');
    }
    if (response.error) {
      throw new ConnectionError(response.error, response['error-type']);
    }
    return { id: response['connection-id'], version: response.version };
  }

  public async deleteConnection(connectionId: string): Promise<void> {
    const response = await this.del(`connections/${encodeURIComponent(connectionId)}`);
    if (!response) {
      throw new Error('No response when trying to remove connection');
    }
    if (response.error) {
      throw new Error(response.error);
    }
  }

  public async reindexConnection(connectionId: string): Promise<void> {
    const response = await this.post(`connections/${encodeURIComponent(connectionId)}/reindex`, {});
    if (!response) {
      throw new Error('No response when trying to reindex connection');
    }
    if (response.error) {
      throw new Error(response.error);
    }
  }
}
