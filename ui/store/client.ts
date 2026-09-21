import { isPlayground } from './util';

// Also correct for the beamlynx-desktop static export loaded via file://:
// window.location.hostname is '' there, so isPlayground() already returns
// false and this falls through to localhost:33333 -- which is exactly the
// bundled local pine-server. Don't "fix" the empty-hostname case without
// checking this.
const getBaseUrl = () => {
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
  parent?: boolean;
  // 'synthetic' is a made-up id=id join with no real FK behind it (today only
  // ever the same-source case - see docs/variables.md in pine-lang - but not
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
export type WhereCondition = [string, string, null, string, { type: string; value: string } | null];

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

export type Column = { alias: string; column: string; 'column-alias': string; hidden: boolean };

/** Range returned by the build endpoint mapping segments to table aliases */
export type PineRange = {
  alias: string;
  start: { line: number; character: number };
  end: { line: number; character: number };
};

export type VariableAst = {
  'selected-tables': Table[];
  tables?: Table[];
  joins: Join[];
  columns: Column[];
};

/** An order-by entry - distinct from Column: no `column-alias`/`hidden`, but carries direction. */
export type OrderColumn = {
  alias: string;
  column: string;
  direction: 'ASC' | 'DESC';
  'operation-index'?: number;
};

/** A group-by entry (pine-lang's ast/group.clj) - alias/column only, no aggregation info canvas mode needs. */
export type GroupColumn = { alias: string; column: string; 'operation-index'?: number };

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
  where: WhereCondition[];
  group?: GroupColumn[];
  prettified: string;
  ranges: PineRange[];
  variables?: Record<string, VariableAst>;
  'pending-assignments'?: Record<string, VariableAst>;
  assign?: string;
};

export type Response = {
  'connection-id': string;
  version: string;
  error: string;
  'error-type': string;
  // build
  ast: Ast;
  query: string;
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

// Mirrors pine-lang's pine.access-policy rule shape and beamlynx-desktop's
// credential-store.ts AccessPolicyRule 1:1 -- sent verbatim (minus
// `enabled`, see AccessPolicyModule below) as the `access-policy` param
// below. See access_policy.clj's docstring for why pine-lang itself
// carries no default of this.
export type AccessPolicyRule =
  | { type: 'column-type'; allow: string[] }
  | { type: 'foreign-key' }
  | { type: 'column-name'; suffix: string };

// One module of a named policy -- see AccessPolicy below. A module is a
// rule plus whether it's currently on; effectiveAccessPolicyRules strips
// `enabled` before this ever reaches pine-lang, which only ever sees rules
// that are already active.
export type AccessPolicyModule = AccessPolicyRule & { enabled: boolean };

// A named, user-creatable set of rule modules (Settings -> Access Policy) --
// there can be several; each connection independently selects which one
// applies to it (ConnectionInfo.policyId below), or none. See
// GlobalStore.accessPolicies.
export type AccessPolicy = {
  id: string;
  name: string;
  rules: AccessPolicyModule[];
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
};

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
  if (forMcp ? !connection.mcpEnabled : connection.applyPolicyToOwnQueries !== true) return [];
  const policy = policies.find(p => p.id === connection.policyId);
  if (!policy) return [];
  return policy.rules.filter(m => m.enabled).map(({ enabled: _enabled, ...rule }) => rule);
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

export class HttpClient {
  constructor(private readonly onBuild?: (ast: Ast) => void) {}

  private async baseGet<T>(path: string): Promise<T | undefined> {
    const res = await fetch(`${getBaseUrl()}/api/v1/${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
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
    if (!res) {
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
      },
      body: JSON.stringify(body),
    });
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
      },
    });
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
    accessPolicyRules?: AccessPolicyRule[],
    // false asks pine-lang to refuse an expression that changes data
    // (delete!/update!, and their d!/u! short forms) rather than run it -- see
    // its docs/side-effects.md. Sent only when explicitly false, so an
    // ordinary call is byte-for-byte the request it was before; pine-lang
    // treats the field's absence as "writes allowed", which is what the
    // person's own editor needs.
    allowWrites?: boolean,
  ): Promise<Response> {
    const body: {
      expressions: string[];
      'access-policy'?: AccessPolicyRule[];
      'allow-writes'?: boolean;
    } = { expressions };
    if (accessPolicyRules?.length) {
      body['access-policy'] = accessPolicyRules;
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

  public async sql(query: string, connectionId?: string): Promise<Response> {
    const response = await this.post(
      'sql',
      this.withConnectionId({ query: query.trim() }, connectionId),
    );
    if (!response) {
      throw new Error('No response when trying to execute SQL');
    }
    return response;
  }

  public async build(
    expressions: string[],
    cursor?: CursorPosition,
    connectionId?: string,
    accessPolicyRules?: AccessPolicyRule[],
  ): Promise<Response> {
    const body: {
      expressions: string[];
      cursor?: CursorPosition;
      'access-policy'?: AccessPolicyRule[];
    } = {
      expressions,
    };
    if (cursor) {
      body.cursor = cursor;
    }
    if (accessPolicyRules?.length) {
      body['access-policy'] = accessPolicyRules;
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
    return response.result[1][0] as number;
  }

  public async makeChildExpressions(
    expression: string,
    connectionId?: string,
  ): Promise<{
    expressions: {
      expression: string;
      column: string;
      relatedColumn: string | null;
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
        column: h.column,
        // The column on THIS side of the join - which is how traversal.ts
        // tells one composite foreign key split into pieces (the pieces
        // point at different parent columns) from two genuinely separate
        // foreign keys to the same table (both point at the same one).
        relatedColumn: h['related-column'] ?? null,
        table: h.table,
        schema: h.schema,
      }));
    return { expressions, ast: response.ast };
  }

  public async buildDeleteQuery(
    expression: string,
    column: string,
    limit: number,
    connectionId?: string,
  ): Promise<string> {
    const x = `${expression}\n| limit: ${limit}\n| delete! .${column}`;
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
    dbType?: 'postgres' | 'mysql';
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
      throw new Error(response.error);
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
      throw new Error(response.error);
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
