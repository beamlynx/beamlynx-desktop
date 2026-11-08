---
name: agent-retro
description: >-
  Runs a retro on how AI agents used Beamlynx through its MCP server: reads the
  agent calls saved in beamlynx.db, sorts each failure into a Pine gap, an
  unclear tool or message, a bug, or the environment, and turns them into
  backlog ideas and PRs. Use when the owner asks for an agent retro, asks how
  agents are doing with Beamlynx, or asks what to improve in the MCP tools.
---

# Agent retro

Beamlynx saves every MCP tool call an agent makes in its `beamlynx.db` (`src/main/mcp/agent-log.ts`): the tool, the Pine or SQL it sent, the error, and how many rows came back. Never the rows. This skill reads that log and turns what went wrong into work. The plan behind it is `beamlynx-plans/plans/024-agents-work-in-pine.md`, part E.

## 1. Get the report

From `beamlynx-desktop`, with Node 22 or later:

```
npm run build
node scripts/agent-retro.mjs --days 7          # the installed app's log
node scripts/agent-retro.mjs --dev --days 7    # the dev build's log
node scripts/agent-retro.mjs --json            # the same, as JSON
```

Pick the period with the owner, or default to the time since the last retro. The file is opened read-only, so the app can stay open.

## 2. Read it

The report gives per session:
- the share of calls that failed
- calls before the first query that returned rows
- retries after an error
- whether the agent noted a finding

It then lists failures by kind:

- **Pine gap.** The agent asked for something Pine can't say, usually SQL that didn't convert. Check whether the backlog already has it (#9 SQL to Pine, #10 arithmetic). If not, add a line under Ideas in `beamlynx-plans/BACKLOG.md` with the next ID, quoting the SQL or Pine that failed.
- **Unclear.** The agent wrote Pine wrong or misused a tool. Ask what would have stopped it: a clearer error, an example in the MCP instructions (`src/main/mcp/instructions.ts`), or the Pine reference. Propose the smallest change.
- **Bug.** Beamlynx broke. Reproduce it, then fix it in its own PR with a changelog entry.
- **Environment.** The app wasn't running, the database was down, or the harness refused. Counted, not acted on, unless one cause keeps coming back.
- **Unclassified.** Read each one, and add a rule to `RULES` in `src/main/agent-retro.ts` with a test in `__tests__/agent-retro.test.js`.

## 3. Report to the owner

Lead with the numbers and how they moved since the last retro. Then give the top three causes, each with what you propose. Ask before opening PRs or adding backlog lines, unless the owner already said to go ahead.

What the log holds is often about production databases. Quote the Pine or SQL an agent sent when it helps. Don't copy error text that holds data values into a PR, an issue or the backlog.

## 4. Keep the cases current

A failure worth keeping becomes a case in `test/agent-cases/` (see its README). Then a change can be checked on the same question before and after.
