import { makeAutoObservable } from 'mobx';
import { format } from 'sql-formatter';
import { Hints, Http, Response } from './http';
import { GraphStore } from './graph.store';
import { Metadata } from '../components/model';

type Column = {
  field: string;
  headerName: string;
  flex: number;
  editable: boolean;
};

type Row = { [key: string]: any };

export class GlobalStore {
  connectionName = '';
  expression = '';
  query = '';
  loaded = false;
  error = '';
  hintsMessage: string = '';
  columns: Column[] = [];
  rows: Row[] = [];
  metadata: Metadata = {};

  constructor(private readonly graphStore: GraphStore) {
    makeAutoObservable(this);
  }

  loadConnectionMetadata = async () => {
    const response = await Http.get('connection');
    if (!response) return;
    const result = response.result as { 'connection-id': string; metadata: Metadata };
    this.connectionName = result['connection-id'];
    this.metadata = result.metadata;
    return this.connectionName;
  };

  buildQuery = async () => {
    const response = await Http.post('build', {
      expression: this.expression,
    });

    if (!response) return;
    this.handleError(response);
    this.setQuery(response);
    this.setHints(response);
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
    // alert('setting the hints')
    this.graphStore.convertHintsToGraph(this.metadata, response.hints, response.context);
    this.hintsMessage = response.hints
      ? JSON.stringify(response.hints, null, 1).substring(0, 200)
      : '';
  };

  evaluate = async () => {
    const response = await Http.post('eval', {
      expression: this.expression,
    });

    if (!response) return;
    this.handleError(response);
    if (!response.result) return;

    const rows = response.result as Row[];
    if (rows.length < 2) {
      this.columns = [];
      this.rows = [];
      return;
    }
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
