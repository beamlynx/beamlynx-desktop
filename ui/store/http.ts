const base = 'http://localhost:33333';

export type QualifiedTable = { schema: string; table: string; alias?: string | null }
export type Hints = { table: QualifiedTable[] };

export type Response = {
  result: unknown;
  'connection-id': string;
  query: string;
  hints: Hints;
  context: QualifiedTable[];
  error: string;
};

export const Http = {
    get: async (path: string): Promise<Response | undefined> => {
    const res = await fetch(`${base}/api/v1/${path}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            },
        })
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
        body: JSON.stringify(body)});
        if (!res.ok) {
            return;
        }
        return await res.json();
    }
}
