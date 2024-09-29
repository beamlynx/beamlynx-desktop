const base = 'http://localhost:33333';

export type Table = { schema: string; table: string; alias: string };
export type TableHint = {
  schema: string;
  table: string;
  column: string;
  parent: boolean;
  pine: string;
};

export type Hints = { table: TableHint[] };
export type OperationName = 'ui-op';
const NoOpOperationNames = ['-', 'delete-recursive'] as const;
export type NoOpOperationName = (typeof NoOpOperationNames)[number];
export type Operation = { type: OperationName; value: NoOpOperationName };

export type State = {
  hints: Hints;
  'selected-tables': Table[];
  joins: string[][];
  context: string;
  operation: Operation;
};

export type Response = {
  result: unknown;
  'connection-id': string;
  query: string;
  error: string;
  'error-type': string;
  state: State;
};

/**
 * @deprecated Use `Client' class
 */
export const Http = {
  get: async (path: string): Promise<Response | undefined> => {
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
  },

  post: async (path: string, body: object): Promise<Response | undefined> => {
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
  },
};

export class Client {
  private cleanExpression(expression: string): string {
    const e = expression.trim();
    return e.endsWith('|') ? e.slice(0, -1) : e;
  }

  public async eval(expression: string): Promise<Response | undefined> {
    return await Http.post('eval', { expression: this.cleanExpression(expression) });
  }
}
