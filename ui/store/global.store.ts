import { makeAutoObservable } from 'mobx';
import { format } from 'sql-formatter';
import { GraphStore } from './graph.store';
import { Http, Response } from './http';
import { Metadata } from '../model';

type Column = {
  field: string;
  headerName: string;
  flex: number;
  editable: boolean;
};

type Row = { [key: string]: any };

export class GlobalStore {
  connected  = false;
  connection = '';
  expression = '';
  query = '';
  loaded = false;
  error = '';
  hintsMessage: string = '';
  columns: Column[] = [];
  rows: Row[] = [];
  metadata: Metadata = { "db/references": { table: {}}};

  // User
  email = '';
  domain = '';

  constructor(private readonly graphStore: GraphStore) {
    makeAutoObservable(this);
  }

  loadConnectionMetadata = async () => {
    const response = await Http.get('connection');
    if (!response) return;
    const result = response.result as { 'connection-id': string; metadata: Metadata };
    this.connection = result['connection-id'];
    this.metadata = result.metadata;
    return this.connection;
  };

  setConnectionName = (response: Response) => {
    if (!response['connection-id']) return;
    this.connection = response['connection-id'];
  }

  setEmail = (email: string) => {
    if (!email) return;
    this.email = email;
    const [,domain] = email?.split('@');
    this.domain = domain;
  }

  handleError = (response: Response) => {
    this.error = response.error || '';
  };

  setQuery = (response: Response) => {
    if (!response.query) return;
    this.query = format(response.query, {
      language: 'postgresql',
    });
    this.loaded = false;
  };

  setHints = (response: Response) => {
    if (!response.hints) return;
    this.graphStore.convertHintsToGraph(this.metadata, response.hints, response.context);
    this.hintsMessage = response.hints
      ? JSON.stringify(response.hints, null, 1).substring(0, 180)
      : '';
  };

  buildQuery = async () => {
    if (!this.connected) {
      this.handleError({ error: 'Not connected' } as Response);
      return;
    }
    const response = await Http.post('build', {
      expression: this.expression,
    });

    if (!response) return;
    this.handleError(response);
    this.setConnectionName(response);
    this.setQuery(response);
    this.setHints(response);
  };

  evaluate = async () => {
    if (!this.connected) {
      this.handleError({ error: 'Not connected' } as Response);
      return;
    }
    const response = await Http.post('eval', {
      expression: this.expression,
    });

    if (!response) return;
    this.handleError(response);
    if (!response.result) return;

    const rows = response.result as Row[];
    const columns = rows[0].map((header: Row, index: number) => {
      return {
        field: index,
        headerName: header,
        flex: 1,
        editable: true,
        minWidth: 200,
        maxWidth: 400,
      };
    });
    this.columns = columns;
    this.rows = rows.splice(1);
    this.loaded = true;
  };
}
