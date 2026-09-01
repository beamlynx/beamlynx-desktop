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
    });

    // In SQL mode, running with text selected runs only the selection.
    const sqlQuery = session.querySelection.trim() || session.query;
    const runsSql = session.inputMode === 'sql' && !opts?.forcePine;

    // Use SQL endpoint if in SQL mode, otherwise use Pine eval endpoint
    const response = runsSql
      ? await this.client.sql(sqlQuery, session.connectionId)
      : await this.client.eval(session.expressions, session.connectionId, session.accessPolicyRules);

    if (!response) {
      runInAction(() => {
        session.message = '🤷 No response';
        session.loading = false;
      });
      return [];
    }

    if (response.error) {
      runInAction(() => {
        session.message = '';
        session.error = response.error;
        session.loading = false;
      });
      return [];
    }

    if (!response.result) {
      runInAction(() => {
        session.loading = false;
      });
      return [];
    }

    const rows = response.result as Row[];
    const result = [...rows];

    // Pine mode - full metadata support
    const columns = response.columns.map((column, index): GridColDef => {
      return {
        field: index.toString(),
        headerName: column['column-alias'] || column['column'],
        flex: 1,
        minWidth: 100,
        maxWidth: 400,
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
      session.loading = false;
      // Only the classic text-first workflow wants focus pulled back to the
      // Pine input after a run finishes. Canvas mode manages its own
      // keyboard focus - and since the Pine input often isn't even mounted
      // there (New Layout's SQL/Pine panel is opt-in), nothing would ever
      // flip session.textInputFocused back to false afterwards, silently
      // and permanently disabling every canvas keybinding (see
      // useCanvasKeybindings.ts's textInputFocused guard).
      if (!session.canvasActive) {
        session.focusTextInput();
      }
      session.mode = 'result';
    });

    return result;
  }
}
