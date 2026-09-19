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

WHAT PINE DOES NOT HAVE

Traps that cost the most round trips, because SQL habits reach for them first:

  no \`or\` in where:   conditions always combine with AND, comma-separated or chained.
                      For one column: \`where: status in ('blocked', 'active')\`.
  no regex operators  no \`~\` or \`~*\`. Use \`where: first_name ilike '%jo%'\`.
  no \`>=\` or \`<=\`     only \`<\` and \`>\`.
  no table qualifiers A column is qualified by an alias, never a table name. Every table has
                      one: \`u_0\` unless you name it yourself with \`public.user as u\`. Both
                      are typeable; \`user.email\` is not.

\`count\` and \`count:\` differ. As an aggregate it takes no colon, as an operation it does:

  user | group: status => count
  user | count:

HOW TO WORK

1. list_connections -- which databases you may query.
2. find_tables -- fuzzy search for a table. Matching is loose, so "ten" finds "tenant".
3. complete_query -- the one you will use most. Give it an expression ending in \`| \` and it
   returns exactly what can be appended at that position: which tables the current one joins
   to, or which columns are available. End with \`| select: \` to list a table's columns.
   Build expressions by extending them one step at a time this way. After a join, only the
   last table's columns are listed -- end with \`| select: u_0.\` (any alias, then a dot) to
   list an earlier one's.
4. run_query -- execute. Opens a visible tab in the user's beamlynx app so they can see it.

SAY WHY

Lead every expression you run with a comment saying what you are looking for and why. beamlynx
renders it as a note above the query, so the person watching sees your reasoning and not just
rows. Write it for them, in plain words -- the question you are answering, and anything about
the query that would not be obvious from reading it.

  /* Tenants that signed up last month but never finished onboarding.
     Checking whether the drop-off is concentrated in one plan. */
  tenant | where: created_at > '2026-08-01' | public.onboarding .tenantId

One comment, at the top, before the first table. \`/* ... */\` spans lines; \`--\` runs to the end
of one. A comment anywhere else in the expression is ignored.

Do not guess at table or column names -- find_tables and complete_query know them. A join
labelled "guessed from column naming" was inferred from a naming pattern with no foreign key
behind it, so confirm it returns sensible rows before relying on it.

Some columns come back as "xxxxx" -- an access policy on that connection redacted them, not a
real value. If one is genuinely blocking something you need, call request_reveal (with a reason)
to ask the user to look at it and decide; it returns a request id right away, not the answer --
call check_reveal with that id and it waits for the user's decision, so no delay of your own is
needed. Do not reach for this by default; most redacted columns are meant to stay that way.`;
