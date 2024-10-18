import { makeAutoObservable, reaction } from 'mobx';
import { Ast, Hints, Operation, Response, State, TableHint } from './http';
import { HttpClient } from './client';
import { generateGraph, Graph } from './graph.util';
import { PineSuggestedNode } from '../model';

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

// TODO: should this go to another place?
const client = new HttpClient();

export class Session {
  id: string;
  expression: string = ''; // observable

  // Result
  loaded: boolean = false;
  columns: Column[] = [];
  rows: Row[] = [];

  mode: Mode = 'none';
  message: string = '';

  /**
   * Resonse
   *  |_ Connection
   *  |_ Error
   *  |_ ErrorType
   *  |_ Ast
   *      |_ Operation
   *      |_ Hints
   *      |_ Query
   */
  response: Response | null = null; // observable
  connection: string = '-';
  error: string = '';
  errorType: string = '';
  // Ast
  operation: Operation = { type: 'table' };
  ast: Ast | null = null; // observable
  query: string = '';
  hints: Hints | null = null; // observable

  // Graph
  candidateIndex: number | undefined = undefined;
  candidate: PineSuggestedNode | null = null;

  graph: Graph = {
    nodes: [],
    edges: [],
  };

  constructor(id: string) {
    this.id = `session-${id}`;

    // TODO: explicitly mark the observables, actions, computables
    makeAutoObservable(this);

    /**
     * Build the expression i.e. get the http repsonse
     */
    reaction(
      () => this.expression,
      async expression => {
        this.response = await client.build(expression);
      },
    );

    /**
     * Handle the response:
     * - connection name
     * - ast
     * - query
     * - operation
     * - error
     */
    reaction(
      () => this.response,
      async response => {
        if (!response) return;

        // connection
        this.connection = response['connection-id'] || '-';

        // ast
        this.ast = response.ast;

        // query
        this.query = response.query;

        // operation
        this.operation = this.handleOperation(response);

        // error
        const { error, errorType } = this.handleError(response);
        this.error = error;
        this.errorType = errorType;
      },
    );

    /**
     * Handle the ast
     * - message from hints
     * - graph from ast
     */
    reaction(
      () => this.ast,
      async ast => {
        if (!ast) return;

        if (ast.hints) {
          const hints = ast.hints;
          this.message = this.getMessageFromHints(hints);
        }

        const { candidate, graph } = generateGraph(ast, this.candidateIndex);
        this.candidate = candidate;
        this.graph = graph;
      },
    );

    reaction(
      () => this.candidateIndex,
      async index => {
        console.log(index);
        const ast = this.ast;
        if (!ast?.hints) return;
        const { candidate, graph } = generateGraph(ast, index);
        this.candidate = candidate;
        this.graph = graph;
      },
    );
  }

  private getMessageFromHints(hints: Hints): string {
    const expressions = hints.table.map(h => h.pine);
    return expressions ? expressions.join(', ').substring(0, 140) : '';
  }

  private handleError(response: Response): { error: string; errorType: string } {
    return {
      error: response.error || '',
      errorType: response['error-type'] || '',
    };
  }

  private handleOperation(response: Response): Operation {
    if (!response.state?.operation) {
      return { type: 'table' };
    }
    return response.state.operation;
  }
}
