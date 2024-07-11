import { makeAutoObservable } from 'mobx';
import { format } from 'sql-formatter';
import { GraphStore } from './graph.store';
import { Http, QualifiedTable, Response } from './http';
import { Metadata } from '../model';
import { pickSuccessMessage } from './success-messages';

type Column = {
  field: string;
  headerName: string;
  flex: number;
  editable: boolean;
  minWidth: number;
  maxWidth: number;
};

type Row = { [key: string]: any };

export class GlobalStore {
  connected = false;
  connection = '';
  expression = '';
  query = '';
  loaded = false;
  error = '';
  message = '';
  hintsMessage: string = '';
  columns: Column[] = [];
  rows: Row[] = [];
  metadata: Metadata = { 'db/references': { table: {} } };

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
  };

  setEmail = (email: string) => {
    if (!email) return;
    this.email = email;
    const [, domain] = email?.split('@');
    this.domain = domain;
  };

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
    this.graphStore.generateGraph(this.metadata, response.context, response.hints.table);
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
      expression: this.cleanExpression(this.expression),
    });

    if (!response) return;
    this.handleError(response);
    if (!response.result) return;

    const rows = response.result as Row[];
    const columns: Column[] = rows[0].map((header: string, index: number): Column => {
      return {
        field: index.toString(),
        headerName: header,
        flex: 1,
        editable: false,
        minWidth: 100,
        maxWidth: 400,
      };
    });
    this.columns = columns;
    this.rows = rows.splice(1).map((row, index) => {
      return {
        ...row,
        _id: index,
      };
    });
    this.message = pickSuccessMessage();
    this.loaded = true;
  };

  updateExpressionUsingCandidate = (schema: string, table: string) => {
    const parts = this.expression.split('|');
    parts.pop();
    parts.push(`${schema}.${table}`);
    this.expression = parts.map(x => x.trim()).join(' | ') + ' |';
  };

  cleanExpression = (expression: string) => {
    const e = expression.trim();
    return e.endsWith('|') ? e.slice(0, -1) : e;
  };
}
