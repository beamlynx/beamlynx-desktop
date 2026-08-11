import { Ast, HttpClient } from '../client';

// A dedicated, stateless client for speculative builds - never the visible
// session's own client instance. No `onBuild` callback (there's nothing to
// wire one to), and no cursor is ever sent: probe expressions are always
// complete, self-contained strings (`expr + " | s: "`, etc.), not a partial
// edit of what's on screen, so there is no caret position that means
// anything for them.
const client = new HttpClient();

/** Speculative build for a picker: never touches session.expression/ast. */
export const probeBuild = async (expression: string, connectionId?: string): Promise<Ast> => {
  const response = await client.build([expression], undefined, connectionId);
  return response.ast;
};
