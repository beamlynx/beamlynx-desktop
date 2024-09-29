import { Operation } from './http';

export type Mode = 'input' | 'graph' | 'result' | 'none';

export type Column = {
  field: string;
  headerName: string;
  flex: number;
  editable: boolean;
  minWidth: number;
  maxWidth: number;
};

export type Row = { [key: string]: any };

export type Session = {
  id: string;
  expression: string;
  query: string;
  loaded: boolean;
  errorType: string;
  columns: Column[];
  rows: Row[];
  mode: Mode;
  message: string;
  error: string;
  operation: Operation;
};

const createSessionId = (id: string) => `session-${id}`;
export const createSession: (id: string) => Session = (id: string) => ({
  id: createSessionId(id),
  expression: '',
  query: '',
  loaded: false,
  errorType: '',
  columns: [],
  rows: [],
  mode: 'none',
  message: '',
  error: '',
  operation: { type: 'ui-op', value: '-' },
});
