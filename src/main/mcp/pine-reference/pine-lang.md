# Introducing Pine-lang

Pine is a pipe-based query language. Data flows left to right: you start with a table, and each
`|` narrows or transforms whatever came before it.

**Syntax:**
```
table_1 | table_2 | operation_1: args | operation_2: args
```

A pipeline reads in the order it executes, so a query can be built up one step at a time: add a
`|`, see what is available at that position, add the next step.

## Every part of the language, and its topic

| Write | What it does | Topic |
|---|---|---|
| `customers` | Start from a table | `table` |
| `customers \| orders` | Join a table | `join` |
| `select:` (`s:`) | Choose the columns, and compute values | `select`, `computed-values` |
| `where:` (`w:`) | Keep the rows that match | `where` |
| `order:` (`o:`) | Sort | `order` |
| `limit:` (`l:`) | Cap the rows, or the rows of each group with `per` | `limit` |
| `group:` (`g:`) | One row per group, with aggregates | `group` |
| `count:` | The number of rows | `count` |
| `from:` (`f:`) | Go back to an earlier table | `from` |
| `unnest:` | One row for each element of a JSON array | `unnest` |
| `describe:` | A table's columns, from the schema Pine holds | `describe` |
| `references:` | How a table joins to others, both ways, and what to type for each | `references` |
| `data.plan` | A key inside a JSON column | `json` |
| `\|= name` | Name a result, to use it later | `named-results` |
| `$name` | A value passed in separately | `variables` |
| `update!` (`u!`) | Change values. Refused over MCP | `update` |
| `delete!` (`d!`) | Remove rows. Refused over MCP | `delete` |

Operations that change data end in `!`. `update!` and `delete!` are the only two. An agent can't
run either: only the user can change data.

## Comments

```
/* Customers who signed up this year.
   Checking the plan mix. */
customers | where: created_at > '2026-01-01' | group: data.plan with count
```

`/* ... */` spans lines, and `--` runs to the end of a line. A comment at the top, before the first
table, is shown to the user as a note above the query.

## Several expressions

Expressions are separated by a blank line. Each can name its result with `|= name` for a later one
to use (see the `named-results` topic). A block of only `$name = value` lines sets values for the
query (see the `variables` topic).
