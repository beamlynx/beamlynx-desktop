const base = 'http://localhost:33333';

export type Table = { schema: string; table: string; alias: string };
export type TableHint = {
  schema: string;
  table: string;
  column: string;
  parent: boolean;
  pine: string;
};

export type ColumnHint = {
  column: string;
};

export type Hints = { table: TableHint[]; select: ColumnHint[] };
// There are more operations. I'll add them as we need to handle them here
export type Operation = { type: 'table' | 'delete' | 'select-partial' };
export type Column = { column: string; alias: string };

export type Ast = {
  hints: Hints;
  'selected-tables': Table[];
  joins: string[][];
  context: string;
  current: string;
  operation: Operation;
  columns: Column[];
};

export type Response = {
  result: (string | number)[][];
  'connection-id': string;
  version: string;
  query: string;
  error: string;
  'error-type': string;
  ast: Ast;
};

export class HttpClient {
  constructor(private readonly onBuild?: (ast: Ast) => void) {}

  public async get(path: string): Promise<Response | undefined> {
    const res = await fetch(`${base}/api/v1/${path}`, {
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

  private async post(path: string, body: object): Promise<Response | undefined> {
    const res = await fetch(`${base}/api/v1/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return;
    }
    return await res.json();
  }

  private cleanExpression(expression: string): string {
    const e = expression.trim();
    return e.endsWith('|') ? e.slice(0, -1) : e;
  }

  public async eval(expression: string): Promise<Response> {
    const response = await this.post('eval', { expression: this.cleanExpression(expression) });
    if (!response) {
      throw new Error('No response when trying to eval');
    }
    return response;
  }

  /**
   * The first column is usually the primary key
   */
  public async getFirstColumnName(expression: string): Promise<{ columnName: string; ast: Ast }> {
    const response = await this.post('eval', {
      expression: this.cleanExpression(`${expression} | 1`),
    });
    if (!response) {
      throw new Error('No response when trying to get the first column name');
    }
    return { columnName: response.result[0][0] as string, ast: response.ast };
  }

  public async build(expression: string): Promise<Response> {
    const response = await this.post('build', { expression });
    if (!response) {
      throw new Error('No response when trying to build');
    }
    this.onBuild && (await this.onBuild(response.ast));
    return response;
  }

  public async count(expression: string): Promise<number> {
    const response = await this.eval(`${expression} | count:`);
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
  ): Promise<{ expressions: string[]; ast: Ast }> {
    // Here we can't use the `build` function as it cleans the expression and
    // hence removing the trailing `|`, but we want to keep it. So we clean the
    // expression and add it explicitly
    const x = `${this.cleanExpression(expression)} |`;
    const response = await this.post('build', { expression: x });
    if (!response) {
      throw new Error('No response when trying to make child Expressions');
    }
    this.onBuild && (await this.onBuild(response.ast));
    const expressions = response.ast.hints.table.filter(h => !h.parent).map(h => `${x} ${h.pine}`);
    return { expressions, ast: response.ast };
  }

  public async buildDeleteQuery(
    expression: string,
    limit: number,
  ): Promise<{ query: string; ast: Ast }> {
    const { columnName } = await this.getFirstColumnName(expression);
    const x = `${expression} | limit: ${limit} | delete! .${columnName}`;
    const response = await this.build(x);
    if (!response) {
      throw new Error('No response when trying to build the delete query');
    }
    return response;
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
}
