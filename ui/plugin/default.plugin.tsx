import { runInAction } from 'mobx';
import { Column, HttpClient } from '../store/client';
import { ColumnMetadata, Row, Session } from '../store/session';
import { EvaluateOptions, PluginInterface } from './plugin.interface';
import { GridColDef } from '@mui/x-data-grid';

export class DefaultPlugin implements PluginInterface {
  private readonly client: HttpClient;
  constructor(private session: Session) {
    this.client = new HttpClient();
  }

  public async evaluate(opts?: EvaluateOptions): Promise<Row[]> {
    const session = this.session;
    runInAction(() => {
      // session.message = '⏳ Fetching rows ...';
      session.error = '';
      session.loading = true;
      // Running a query means the results pane is showing that query now, not
      // whatever traversal was last in it. Non-null `traversal` is what makes
      // the pane render a traversal instead of rows, so clearing it here is
      // the whole handover.
      session.traversal = null;
    });

    // In SQL mode, running with text selected runs only the selection.
    const sqlQuery = session.querySelection.trim() || session.query;
    const runsSql = session.inputMode === 'sql' && !opts?.forcePine;

    try {
      // Use SQL endpoint if in SQL mode, otherwise use Pine eval endpoint.
      // Network-level failures (e.g. the server unreachable -- fetch throws
      // a bare TypeError rather than resolving) used to escape uncaught
      // past every one of this function's `session.loading = false` sites
      // below, since none of them run on a thrown exception -- leaving the
      // loading spinner stuck on indefinitely with no error shown.
      const response = runsSql
        ? await this.client.sql(sqlQuery, session.connectionId)
        : await this.client.eval(
            session.expressions,
            session.connectionId,
            session.accessPolicyRules,
            opts?.allowWrites,
          );

      if (!response) {
        runInAction(() => {
          session.message = '🤷 No response';
        });
        return [];
      }

      // Applies regardless of response.error below - a query that parses fine
      // but fails at the DB still deserves to show the agent's expression
      // cleanly formatted, not whatever raw string it sent.
      if (opts?.applyServerPrettified && response.prettified) {
        runInAction(() => {
          session.expression = response.prettified;
        });
      }

      if (response.error) {
        runInAction(() => {
          session.message = '';
          session.error = response.error;
        });
        return [];
      }

      if (!response.result) {
        return [];
      }

      const rows = response.result as Row[];
      const result = [...rows];

      // Pine mode - full metadata support
      const columns = response.columns.map((column, index): GridColDef => {
        return {
          field: index.toString(),
          headerName: column['column-alias'] || column['column'],
          // No flex/width here - Result.tsx computes a fixed pixel width
          // per column from a sample of the actual rows (column-width.util.ts).
          // flex: 1 meant DataGrid recalculated every column's width across
          // every visible row on every resize, expensive enough to stutter
          // a panel animating at the same time.
          editable: true,
          disableReorder: true,
        };
      });

      const columnMetadata = response.columns.reduce<ColumnMetadata>(
        (acc, column, index) => {
          acc.colIndexToAliasLookup[index.toString()] = column['alias'];
          acc.colIndexToColumnLookup[index.toString()] = column['column'];
          if (column.column !== 'id') {
            return acc;
          }
          acc.aliasToIdLookup[column['alias']] = index.toString();
          return acc;
        },
        { colIndexToAliasLookup: {}, aliasToIdLookup: {}, colIndexToColumnLookup: {} },
      );

      const columnVisibilityModel = response.columns.reduce(
        (acc, column, index) => {
          acc[index.toString()] = !column.hidden;
          return acc;
        },
        {} as Record<string, boolean>,
      );

      runInAction(() => {
        session.columns = columns;
        session.columnVisibilityModel = columnVisibilityModel;
        session.columnMetadata = columnMetadata;
        session.rows = rows.slice(1).map((row, index) => {
          return { ...row, _id: index };
        });
        session.expressionAtLastEval = runsSql ? sqlQuery : session.expression;

        // session.message = pickSuccessMessage();
        // Canvas is always mounted now (the classic node-graph widget,
        // GraphBox, was removed) and manages its own keyboard focus - and
        // since the Pine input often isn't even mounted (New Layout's SQL/
        // Pine panel is opt-in), pulling focus back to it here would leave
        // session.textInputFocused stuck true with nothing to flip it back,
        // silently and permanently disabling every canvas keybinding (see
        // useCanvasKeybindings.ts's textInputFocused guard) - so, unlike the
        // classic text-first workflow this used to also serve, focus is
        // never pulled back to the Pine input after a run finishes.
        session.mode = 'result';
      });

      return result;
    } catch (e) {
      runInAction(() => {
        session.message = '';
        session.error = e instanceof Error ? e.message : 'Unknown error';
      });
      return [];
    } finally {
      runInAction(() => {
        session.loading = false;
      });
    }
  }
}
