import { Column, HttpClient } from '../store/client';
import { ColumnMetadata, Row, Session } from '../store/session';
import { PluginInterface } from './plugin.interface';
import { GridColDef } from '@mui/x-data-grid';

export class DefaultPlugin implements PluginInterface {
  private readonly client: HttpClient;
  constructor(private session: Session) {
    this.client = new HttpClient();
  }

  public async evaluate(): Promise<Row[]> {
    const session = this.session;
    // session.message = '⏳ Fetching rows ...';
    session.error = '';
    session.loading = true;

    // Use SQL endpoint if in SQL mode, otherwise use Pine eval endpoint
    const response =
      session.inputMode === 'sql'
        ? await this.client.sql(session.query)
        : await this.client.eval(session.expression);

    if (!response) {
      session.message = '🤷 No response';
      session.loading = false;
      return [];
    }

    if (response.error) {
      session.message = '';
      session.error = response.error;
      session.loading = false;
      return [];
    }

    if (!response.result) {
      session.loading = false;
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

    session.columns = columns;
    session.columnVisibilityModel = columnVisibilityModel;
    session.columnMetadata = columnMetadata;
    session.rows = rows.slice(1).map((row, index) => {
      return { ...row, _id: index };
    });
    session.expressionAtLastEval = session.inputMode === 'sql' ? session.query : session.expression;

    // session.message = pickSuccessMessage();
    session.loading = false;
    session.focusTextInput();
    session.mode = 'result';

    return result;
  }
}
