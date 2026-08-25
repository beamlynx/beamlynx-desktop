// The MCP protocol delivers a server's `instructions` in the initialize
// response, before the client makes a single tool call. That makes it the
// only place to teach Pine for free: no foundation model has Pine in its
// training data, so without this the agent's first move is to guess SQL,
// get a parse error, and only then go looking for documentation.
//
// Three layers teach Pine, and this is the first: an always-present primer
// (here), contextual hints for the exact position in an expression
// (complete_query), and the relevant doc pushed inline the moment something
// fails to parse (format.ts's formatExpressionError). Nothing is left for
// the agent to pull speculatively.
//
// Keep this short. It is prepended to every session whether it gets used or
// not, so it earns its place by covering the shape of the language and the
// tool loop -- not by being a reference. get_pine_doc is the reference.
export const SERVER_INSTRUCTIONS = `beamlynx queries databases with Pine, a pipe-based query language. Pine is not SQL, and no
part of this server accepts SQL -- expressions are Pine only.

SHAPE

  table | operation: args | operation: args

Data flows left to right. Each \`|\` narrows or transforms what came before.

  user | where: status = 'active' | select: id, email | order: created_at desc | limit: 10

Joins are a table name plus the column to join on, not an ON clause:

  user | public.document .userId

Operations: select: (s:), where: (w:), order: (o:), limit: (l:), group: (g:), count:, from: (f:)

HOW TO WORK

1. list_connections -- which databases you may query.
2. find_tables -- fuzzy search for a table. Matching is loose, so "ten" finds "tenant".
3. complete_query -- the one you will use most. Give it an expression ending in \`| \` and it
   returns exactly what can be appended at that position: which tables the current one joins
   to, or which columns are available. End with \`| select: \` to list a table's columns.
   Build expressions by extending them one step at a time this way.
4. run_query -- execute. Opens a visible tab in the user's beamlynx app so they can see it.

Do not guess at table or column names -- find_tables and complete_query know them. A join
labelled "guessed from column naming" was inferred from a naming pattern with no foreign key
behind it, so confirm it returns sensible rows before relying on it.`;
