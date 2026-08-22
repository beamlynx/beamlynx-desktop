import { Ast, HttpClient } from '../client';

// A dedicated, stateless client for speculative builds - never the visible
// session's own client instance. No `onBuild` callback (there's nothing to
// wire one to), and no cursor is ever sent: probe expressions are always
// complete, self-contained strings (`expr + " | s: "`, etc.), not a partial
// edit of what's on screen, so there is no caret position that means
// anything for them.
const client = new HttpClient();

/**
 * Speculative build for a picker: never touches session.expression/ast.
 * Resolves (not rejects) with `undefined` when the server can't build the
 * expression into a proper ast at all - confirmed live for text referencing
 * an alias that doesn't exist (canvas.store.ts's deleteNode deliberately
 * produces this - see pine-text.ts's removeNode). The `| undefined` here
 * used to just say `Ast`, which let a caller's `ast.prettified` compile
 * clean and then crash the whole app at runtime the first time this
 * actually happened.
 */
export const probeBuild = async (expression: string, connectionId?: string): Promise<Ast | undefined> => {
  const response = await client.build([expression], undefined, connectionId);
  return response.ast;
};
