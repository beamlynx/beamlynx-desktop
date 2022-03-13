import { makeAutoObservable } from "mobx";
import { format } from "sql-formatter";

// TODO: extract to a common class
type Response = {
  result: string;
  'connection-id': string;
  query: string;
};

export class Store {
    connection = '';
    expression = '';
    query = '';

    constructor() {
        makeAutoObservable(this);
    }

    getActiveConnection = async () => {
        const res = await fetch('http://localhost:33333/connection', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            },
        })
        if (res.status !== 200) {
            return;
        }
        const response: Response = await res.json();
        
        this.connection = response.result;
        return this.connection;
    }

    buildQuery = async () => {
      const res = await fetch('http://localhost:33333/build', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expression: this.expression
        })});

        if (!res.ok) {
            this.query = '?';
        }

        const response: Response = await res.json();
        this.query = format(response.query, {
            language: 'postgresql'
        });
        this.connection = response["connection-id"];
    }
}