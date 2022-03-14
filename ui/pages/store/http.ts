const base = 'http://localhost:33333';

// TODO: extract to a common class
export type Response = {
  result: unknown;
  'connection-id': string;
  query: string;
  error: string;
};

export const Http = {
    get: async (path: string): Promise<Response | undefined> => {
    const res = await fetch(`${base}/${path}`, {
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
      const res = await fetch(`${base}/${path}`, {
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
