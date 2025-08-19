import { format } from 'sql-formatter';
import { Session } from '../store/session';
import { PluginInterface } from './plugin.interface';
import { Ast, HttpClient } from '../store/client';

export class RecursiveDeletePlugin implements PluginInterface {
  private readonly client: HttpClient;
  constructor(private session: Session) {
    this.client = new HttpClient(async (ast: Ast) => {
      // wait for 100 ms before setting the hints
      await new Promise(resolve => setTimeout(resolve, 100));
      this.session.ast = ast;
    });
  }
  public async evaluate(): Promise<void> {
    const startTime = Date.now();
    try {
      this.session.loading = true;
      const expression = this.session.expression.split('|').slice(0, -1).join('|');

      this.session.query = '/* Recursive deletion in progress ... */';

      // Create the delete queries
      const queries: string[] = ['/* DELETE queries */', 'BEGIN;'];
      // FIXME: The column name is hardcoded to `id`. This means that if a table
      // that doesn't have `id` as the primary column won't be deleted using the
      // recursive delete method.
      await this.collectDeleteQueries(expression, 'id', queries);
      queries.push('COMMIT;');

      // Format the queries
      this.session.query = queries
        .map(q => {
          if (q.trim().startsWith('/*')) {
            return q;
          }
          return format(q, {
            language: 'postgresql', 
            indentStyle: 'tabularRight',
            denseOperators: false,
          });
        })
        .join('\n\n');
      // FIXME: I am not sure how to design this. When we get all the queries, I
      // show the graph to the right so that the queries also also visible.
      // Currently, there is no way to see the queries if the result mode is
      // enabled as the graph is shown in place of the queries (i.e. the
      // secondary view is not visible).
      this.session.mode = 'graph';
    } catch (e) {
      this.session.error = e instanceof Error ? e.message : 'Unknown error';
      this.session.query = `/* Recursive deletion failed */`;
    } finally {
      this.session.loading = false;
      const timeTaken = Date.now() - startTime;
      const minutes = Math.floor(timeTaken / 60000);
      const seconds = Math.floor((timeTaken % 60000) / 1000);
      this.session.message = `⏱️ Time taken: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    return Promise.resolve();
  }

  private async collectDeleteQueries(
    expression: string,
    column: string,
    deleteQueries: string[],
  ): Promise<void> {
    await this.client.build(expression);
    const count = await this.client.count(expression);

    if (count === 0) {
      return;
    }

    // Recurse to process children first
    const { expressions } = await this.client.makeChildExpressions(expression);

    for (const { expression: childExpression, column: childColumn } of expressions) {
      await this.collectDeleteQueries(childExpression, childColumn, deleteQueries);
    }

    // After processing children, add the delete query for the current expression
    const query = await this.client.buildDeleteQuery(expression, column, count);
    deleteQueries.push(`/*\n${expression}\n*/`);
    deleteQueries.push(query);
  }
}
