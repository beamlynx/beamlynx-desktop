// The MCP protocol delivers a server's `instructions` in the initialize
// response, before the client makes a single tool call. That makes it the
// only place to teach Pine for free: no foundation model has Pine in its
// training data, so without this the agent's first move is to guess SQL,
// get a parse error, and only then go looking for documentation.
//
// Three layers teach Pine, and this is the first: an always-present primer
// (here), contextual hints for the exact position in an expression
// (complete_query, and the "What fits here" line of a parse error), and the
// relevant doc pushed inline the moment something fails to parse (format.ts's
// formatExpressionError). Nothing is left for the agent to pull
// speculatively.
//
// Keep this short. It is prepended to every session whether it gets used or
// not, so it earns its place by covering the shape of the language, the
// questions agents ask most, and the tool loop -- not by being a reference.
// get_pine_doc is the reference. Every example here runs on a real database
// (beamlynx-desktop test/agent-cases/fixture.sql has the tables for most).
export const SERVER_INSTRUCTIONS = `beamlynx queries databases with Pine, a pipe-based query language. run_sql_as_pine takes SQL
instead: it is converted to Pine, and only the Pine runs, under the same access policy. Its result
starts with that Pine, which is a good way to learn Pine. SQL that Pine can't say is refused with
the reason. An UPDATE or DELETE never runs: only the user can run a change.

SHAPE

  table | operation: args | operation: args

Data flows left to right. Each \`|\` narrows or transforms what came before.

  user | where: status = 'active' | select: id, email | order: created_at desc | limit: 10

Joins are a table name plus the column to join on, not an ON clause:

  user | public.document .userId

Operations: select: (s:), where: (w:), order: (o:), limit: (l:), group: (g:), count:, from: (f:),
unnest: (a row for each element of a JSON array), describe: (a table's columns), references:
(how a table joins).
get_pine_doc "pine-lang" lists every part of the language and the topic that covers it.

A value can be computed, and named with \`as\` (get_pine_doc "computed-values"). \`x => f\` applies
a function, the same as \`f(x)\`. A key inside a JSON column is a dotted path (get_pine_doc "json"):

  document | select: id, coalesce(title, 'untitled') as label, created_at => month as m
  customer | where: data.address.country = 'SE' | select: data.plan, data.tags[0]

WHAT PINE DOES NOT HAVE

Traps that cost the most round trips, because SQL habits reach for them first:

  no comma or \`and\`   between conditions in one where:. Use \`or\`, or chain another where:
                      for each condition that must hold: \`| where: a = 1 | where: b = 2\`.
  no regex operators  no \`~\` or \`~*\`. Use \`where: first_name ilike '%jo%'\`.
  no table qualifiers A column is qualified by an alias, never a table name. Every table has
                      one: \`u_0\` unless you name it yourself with \`public.user as u\`.
  no conditions as    group: keys are columns or computed names. Compute the condition with
  group: keys         select: first, then group on its name (below).

\`count\` and \`count:\` differ. As an aggregate it takes no colon, as an operation it does:

  user | group: status with count
  user | count:

COMMON QUESTIONS

A question about each group is one query, not one query per group. Every run opens in the
user's tab, so don't loop.

  Each tenant's latest login. \`limit: N per\` keeps the first N rows of each group, ranked by
  the order: before it:
    activity | where: type = 'login' | order: created_at desc | limit: 1 per tenant_id
  After \`limit: … per\` (or group:), only the last table's columns are left. To keep columns of
  an earlier table, select them before:
    tenant | activity .tenant_id | select: t_0.name, a_1.created_at | order: a_1.created_at desc | limit: 1 per t_0.id

  Logins per tenant. In group:, the keys come first, then \`with\` and the aggregates:
    tenant | activity .tenant_id | where: type = 'login' | group: t_0.name with count
  Count only some rows with \`where\` on the aggregate:
    activity | group: tenant_id with count, count where type = 'export' as exports

  Users who never logged in: a :left join keeps every user, and the missing side is null:
    user | activity .user_id :left | where: a_1.id is null | select: u_0.email
  Users who did: a plain join, grouped so each user is one row:
    user | activity .user_id | group: u_0.email with count

  How many rows have no user, by computing the condition first:
    activity | select: user_id is null as no_user | group: no_user with count

HOW TO WORK

1. list_connections -- which databases you may query.
2. find_tables -- fuzzy search for a table. Matching is loose, so "ten" finds "tenant".
3. Learn a table with run_query, without guessing:
   \`table | describe:\` lists its columns: type, key, whether they may be empty, whether masked.
   \`table | references:\` lists how it joins to other tables, both ways, with what to type
   after \`| \` for each.
4. complete_query -- what can come next. End an expression with \`| \` for the joins from the
   current table, or \`| select: \` for its columns. A parse error says what fits there too.
5. run_query -- execute. Opens a visible tab in the user's beamlynx app so they can see it.
   run_sql_as_pine does the same for SQL. With no limit: of your own, a result stops at 250
   rows (10,000 for a group:), and says so.

Do not guess at table or column names. A join guessed from column naming has no foreign key
behind it, so check it returns sensible rows.

SAY WHY

Lead every expression you run with a comment saying what you are looking for and why. beamlynx
shows it above the query, so the person watching sees your reasoning, not just rows:

  /* Tenants that signed up last month but never finished onboarding.
     Checking whether the drop-off is concentrated in one plan. */
  tenant | where: created_at > '2026-08-01' | public.onboarding .tenantId

One comment, at the top, before the first table. \`/* ... */\` spans lines; \`--\` runs to the end
of one.

MASKED COLUMNS

A column that comes back as "xxxxx" is masked by that connection's masking policy (the tools
call it an access policy). Most masked columns are meant to stay that way. The policy masks
what comes back, not what you ask: you may filter, sort and join on a masked column with a
value you supply, like \`where: email = 'ann@example.com'\`. Only a group: key or a ::uuid cast
on one is refused, since each would return its value.

get_access_policy reads the policy's rules and their ids. To see a masked column, propose the
narrowest change that answers the question with propose_policy_change, and say why. The user
applies or declines it in beamlynx, and your call waits for the answer. You may also propose
hiding something that should not be visible. Don't ask the user to change the policy by hand.

THE USER IS WATCHING

The user follows your work in beamlynx, in a tab of its own. Help them follow it with
run_query's (and run_sql_as_pine's) optional fields:

- question: what you are investigating, in their terms. Send it with your first query, and
  again only when the user asks something new: it starts a new section in their timeline.
- finding: something you learned that matters to the answer, from earlier results or another
  tool. It shows above that query.

When the user runs a query themselves in that tab, you are told at the top of your next tool
result, in a note starting "From beamlynx".`;
