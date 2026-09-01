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

export type Hints = {
  table: TableHint[];
  select: ColumnHint[];
  order: ColumnHint[];
  where: ColumnHint[];
  update: ColumnHint[];
  context: string;
};
// There are more operations. I'll add them as we need to handle them here
export type OperationType =
  | 'table'
  | 'delete'
  | 'select'
  | 'select-partial'
  | 'order'
  | 'order-partial'
  | 'where'
  | 'where-partial'
  | 'update-action'
  | 'update-partial';
export type Operation = {
  type: OperationType;
  // Shape varies by operation type (e.g. `{schema, table, alias?}` for
  // 'table', a column array for 'select-partial', ...) - only the 'table'
  // shape is currently consumed (canvas mode's still-being-typed node; see
  // layout.ts), so this is intentionally loose rather than a full union.
  value?: unknown;
};
export type WhereCondition = [string, string, null, string, { type: string; value: string } | null];

/**
 * ON-clause equality: `${alias1}.${col1} = ${alias2}.${col2}`. Position 2
 * (`'has'`/`'of'`) records which side owns the FK. Position 6 is the same
 * confidence tag a `TableHint` carries (see `TableHint.resolution`) - added
 * by pine-lang so an already-committed join doesn't need a client-side
 * workaround (re-deriving it from the picker hint that produced it) to know
 * whether it's backed by a real FK.
 */
// col/f-col/resolution can all come back null - a "hint-less" join pine-lang
// returns (rather than nulling the whole relation) when an explicit
// join-column doesn't match any real reference for the resolved pair - see
// join-helper's comment in pine-lang's src/pine/ast/table.clj. Callers must
// treat that the same as a null relation (see layout.ts's addJoins), not as
// a resolved-but-uncertain join. Trailing element is needs-cast? (unused
// here - only eval.clj's SQL generation reads it).
export type JoinRelation = [string, string | null, 'has' | 'of', string, string | null, TableHint['resolution'] | null, boolean];
/** `[from-alias, to-alias, relation, join-type]` — join-type is `'LEFT'`/`'RIGHT'`/null (inner). */
export type JoinTuple = [string, string, JoinRelation | null, string | null];

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
  joins: JoinTuple[];
  columns: Column[];
};

/** An order-by entry - distinct from Column: no `column-alias`/`hidden`, but carries direction. */
export type OrderColumn = { alias: string; column: string; direction: 'ASC' | 'DESC'; 'operation-index'?: number };

/** A group-by entry (pine-lang's ast/group.clj) - alias/column only, no aggregation info canvas mode needs. */
export type GroupColumn = { alias: string; column: string; 'operation-index'?: number };

export type Ast = {
  hints: Hints;
  'selected-tables': Table[];
  joins: JoinTuple[];
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
  // eval
  result: (string | number)[][];
  columns: Column[];
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
  // (`${dbHost}:${dbPort}`) without an extra round trip.
  dbHost?: string;
  dbPort?: string;
  // Desktop-only: whether this saved connection has been opted in to MCP
  // access. See GlobalStore.setMcpEnabled and
  // beamlynx-plans/pending/2026-08-15-mcp-server-and-url-scheme.md.
  mcpEnabled?: boolean;
  // Desktop-only: which access policy (if any) applies to this connection,
  // defaulted at connection creation (credential-store.ts's saveConnection)
  // to whichever policy exists first. Applies from any tab, not just
  // MCP-driven ones -- see Session.accessPolicyRules. null when no policy
  // is selected, or when the one it used to point at was deleted. MCP can
  // only be enabled while this resolves to an active policy -- see
  // effectiveAccessPolicyRules below.
  policyId?: string | null;
  // Desktop-only: whether the connection owner has switched the assigned
  // policy OFF for their own (non-MCP) queries on this connection -- MCP
  // always uses the assigned policy regardless of this. Defaults to false
  // (protected by default); undefined (older saved connections) means
  // false. See effectiveAccessPolicyRules below.
  bypassPolicyForOwnQueries?: boolean;
};

// The single place that decides which rules actually apply for a
// connection right now -- shared by Session.accessPolicyRules (session.ts,
// human tabs and the dedicated MCP tab alike) and GlobalStore's
// mcpQueryDeps (explainMcpQuery, which has no Session to read this from).
//
// `forMcp` is the one thing that can differ between the two callers:
// - MCP (forMcp: true) always uses the connection's assigned policy the
//   moment mcpEnabled is true -- credential-store.ts's setMcpEnabled
//   refuses turning mcpEnabled on unless policyId already resolves to a
//   policy with an active rule, so there is no "MCP on, no policy" state to
//   handle here. bypassPolicyForOwnQueries is never consulted for this
//   caller: it governs the human's own tabs only, never what the agent sees.
// - A human's own tab (forMcp: false) applies the assigned policy unless
//   bypassPolicyForOwnQueries is explicitly true -- independent of
//   mcpEnabled, so turning MCP off (or never turning it on) doesn't also
//   unprotect the human's own browsing on that connection.
export function effectiveAccessPolicyRules(
  connection: ConnectionInfo | undefined,
  policies: AccessPolicy[],
  forMcp: boolean,
): AccessPolicyRule[] {
  if (!connection?.policyId) return [];
  if (forMcp ? !connection.mcpEnabled : connection.bypassPolicyForOwnQueries === true) return [];
  const policy = policies.find(p => p.id === connection.policyId);
  if (!policy) return [];
  return policy.rules.filter(m => m.enabled).map(({ enabled: _enabled, ...rule }) => rule);
}

export type ConnectionsListResult = {
  version: string;
  'selected-connection-id': string | null;
  connections: ConnectionInfo[];
};

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
  ): Promise<Response> {
    const body: { expressions: string[]; 'access-policy'?: AccessPolicyRule[] } = { expressions };
    if (accessPolicyRules?.length) {
      body['access-policy'] = accessPolicyRules;
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
    const body: { expressions: string[]; cursor?: CursorPosition; 'access-policy'?: AccessPolicyRule[] } = {
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
  ): Promise<{ expressions: { expression: string; column: string }[]; ast: Ast }> {
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
          !h.parent && h.resolution !== 'heuristic' && h.resolution !== 'synthetic' && h.column !== undefined,
      )
      .map(h => ({
        expression: `${x} ${h.pine}`,
        column: h.column,
      }));
    return { expressions, ast: response.ast };
  }

  public async buildDeleteQuery(
    expression: string,
    column: string,
    limit: number,
    connectionId?: string,
  ): Promise<string> {
    const x = `${expression} | limit: ${limit} | delete! .${column}`;
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
      dbtype: 'postgres', // Assuming postgres as default
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
    const response = await this.post(`connections/${connectionId}/connect`, {});
    if (!response) {
      throw new Error('No response when trying to test connection');
    }
    if (response.error) {
      throw new Error(response.error);
    }
    return { id: response['connection-id'], version: response.version };
  }

  public async deleteConnection(connectionId: string): Promise<void> {
    const response = await this.del(`connections/${connectionId}`);
    if (!response) {
      throw new Error('No response when trying to remove connection');
    }
    if (response.error) {
      throw new Error(response.error);
    }
  }

  public async reindexConnection(connectionId: string): Promise<void> {
    const response = await this.post(`connections/${connectionId}/reindex`, {});
    if (!response) {
      throw new Error('No response when trying to reindex connection');
    }
    if (response.error) {
      throw new Error(response.error);
    }
  }
}
