import type {
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from '@codemirror/autocomplete';
import type { SqlJoinHint } from '../store/client';

// JOIN, then the name being typed, if any, right before the cursor.
const AFTER_JOIN = /\bjoin\s+(\S*)$/i;

/**
 * Completion after JOIN in the SQL panel: the tables that join to the
 * query's, with the ON clause written (pine-lang's /sql-join-hints, which
 * uses the same join hints as the Pine panel). Asks the server only after
 * JOIN. The suggestions are filtered by the name being typed, and come
 * before the plain table names the SQL mode offers there.
 */
export function sqlJoinSource(
  fetchJoins: (query: string, cursor: number) => Promise<SqlJoinHint[]>,
): CompletionSource {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const match = AFTER_JOIN.exec(context.state.sliceDoc(0, context.pos));
    if (!match) return null;
    const joins = await fetchJoins(context.state.doc.toString(), context.pos);
    if (context.aborted || joins.length === 0) return null;
    return {
      from: context.pos - match[1].length,
      options: joins.map(join => ({
        label: join.sql,
        detail: join.resolution === 'fk' ? 'foreign key' : 'guessed from column names',
        type: 'class',
        boost: 50,
      })),
    };
  };
}
