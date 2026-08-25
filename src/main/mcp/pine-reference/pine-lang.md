# Introducing Pine-lang

Pine is a pipe-based query language. Data flows left to right: you start with a table, and each
`|` narrows or transforms whatever came before it.

**Syntax:**
```
table_1 | table_2 | operation_1: args | operation_2: args
```

A pipeline reads in the order it executes, so a query can be built up one step at a time — add a
`|`, see what is available at that position, add the next step.

**Operations:** `select:` (`s:`), `where:` (`w:`), `order:` (`o:`), `limit:` (`l:`),
`group:` (`g:`), `count:`, `from:` (`f:`), `delete!`, and `|=` to name a result.

Operations that modify data are suffixed with `!` — `delete!` is the only one, and it is
disabled by default.
