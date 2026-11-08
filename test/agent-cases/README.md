# Agent cases

Real kinds of questions agents ask, on a small database, so a change to the MCP tools or their instructions can be tried on the same questions before and after. See beamlynx-plans/plans/024-agents-work-in-pine.md, part E.

Nothing here runs an agent on its own. A person runs a case through Claude Code (or another harness) and compares.

## A case

One JSON file per question:

| Field | What it is |
|---|---|
| `question` | What to ask the agent, word for word. |
| `kind` | The kind of question, from the plan: latest N per group, count per group, rows that lack a related row. |
| `fixture` | The SQL that builds the database. Every case uses `fixture.sql` for now. |
| `expect` | The answer: how many rows, and rows it must contain. Column names and order don't matter. |
| `good_pine` | One Pine expression that answers it, checked against the fixture. A reference, not the only right answer. |

`fixture.sql` has three tenants, five users and a few logins and exports. It is small on purpose, so an answer can be checked by eye.

## Running a case

1. Build the database: `node scripts/agent-case-db.mjs /tmp/agent-cases.db` (Node 22 or later).
2. In Beamlynx, add it as a SQLite connection, and turn it on for agents on the Agent page.
3. In a new Claude Code session with the Beamlynx MCP server, ask the case's `question`. Add "Use the agent-cases.db connection." so it doesn't pick another database.
4. Check the answer against `expect`.
5. Run the retro on what the agent did: `npm run build && node scripts/agent-retro.mjs --days 1` (add `--dev` for a dev build). It shows how many calls it took, which failed, and why.

Note the retro's numbers for the case: calls, failed calls, and calls before the first rows. Run the same cases after a change to compare.

## Adding a case

Take the question from a real session, usually a failure the retro listed. Rewrite it for `fixture.sql`, adding tables or rows there if it needs them. Check `good_pine` on the fixture before committing.
